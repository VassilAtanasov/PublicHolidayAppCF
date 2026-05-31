import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "edge";

const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const VECTORIZE_INDEX_NAME = "holidays-rag-index";

export async function POST(request: Request) {
  try {
    const { userPrompt } = (await request.json()) as { userPrompt?: string; };

    if (!userPrompt) {
      return NextResponse.json({ error: "userPrompt is required." }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_WORKERS_AI_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_WORKERS_AI_API_TOKEN;

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: "Missing Cloudflare configuration." },
        { status: 500 },
      );
    }

    // Step 1: LLM Extraction
    console.log("Step 1: Extracting metadata...");

    // We want the LLM to output ONLY a JSON object.
    const extractionSystemPrompt = `You are an expert query parser. Given a user's question about holidays, extract the search criteria into a strict JSON object.
Return ONLY valid JSON and absolutely nothing else. No markdown formatting, no backticks.
The JSON must have this exact schema:
{
  "semantic_query": "The core thematic part of the query (e.g. 'spooky', 'spring festival', 'independence'). If they just ask for a date, put 'public holiday'.",
  "start_date": "2026-01-01", // Earliest matching date in YYYY-MM-DD format
  "end_date": "2026-12-31",   // Latest matching date in YYYY-MM-DD format
  "countries": ["United States"] // Array of country names, or empty array [] if worldwide
}

Assume the current year is 2026 if not specified.
Example user query: "Are there any spooky holidays in the US in October?"
Example JSON output: {"semantic_query": "spooky holiday", "start_date": "2026-10-01", "end_date": "2026-10-31", "countries": ["United States"]}`;

    const extractionRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${LLM_MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: extractionSystemPrompt },
            { role: "user", content: userPrompt }
          ]
        })
      }
    );

    if (!extractionRes.ok) throw new Error("Failed extraction: " + await extractionRes.text());
    const extractionData = await extractionRes.json() as any;
    let filterMetadata;
    const responseData = extractionData.result?.response;

    if (typeof responseData === "object" && responseData !== null) {
      filterMetadata = responseData;
    } else {
      let extractedJsonStr = String(responseData || "").trim();
      extractedJsonStr = extractedJsonStr.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      try {
        filterMetadata = JSON.parse(extractedJsonStr);
      } catch (e) {
        // Try regex extraction of JSON block from conversational output
        const jsonMatch = extractedJsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            filterMetadata = JSON.parse(jsonMatch[0]);
          } catch (innerErr) {
            console.error("Failed to parse regex-extracted JSON: ", jsonMatch[0]);
            filterMetadata = {};
          }
        } else {
          console.error("Failed to parse JSON from LLM: ", extractedJsonStr);
          filterMetadata = {};
        }
      }
    }

    // Ensure all filter metadata matches expected types to prevent VECTOR_QUERY_ERROR: Status + 400
    if (filterMetadata && typeof filterMetadata === "object") {
      // If LLM returned valid JSON but without start_date / end_date, attempt prompt-based fallback extraction
      if (!filterMetadata.start_date && !filterMetadata.end_date) {
        try {
          let extractedDate: string | null = null;
          const ymdMatch = userPrompt.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (ymdMatch) {
            extractedDate = ymdMatch[0];
          } else {
            const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
            const promptLower = userPrompt.toLowerCase();
            for (const m of months) {
              if (promptLower.includes(m)) {
                const monthIndex = months.indexOf(m) % 12;
                const monthNum = String(monthIndex + 1).padStart(2, "0");
                
                const pattern1 = new RegExp(`${m}\\s+(\\d{1,2})\\D+(\\d{4})`, "i");
                const match1 = userPrompt.match(pattern1);
                if (match1) {
                  const dayNum = match1[1].padStart(2, "0");
                  const yearNum = match1[2];
                  extractedDate = `${yearNum}-${monthNum}-${dayNum}`;
                  break;
                }
                
                const pattern2 = new RegExp(`(\\d{1,2})\\s+${m}\\D+(\\d{4})`, "i");
                const match2 = userPrompt.match(pattern2);
                if (match2) {
                  const dayNum = match2[1].padStart(2, "0");
                  const yearNum = match2[2];
                  extractedDate = `${yearNum}-${monthNum}-${dayNum}`;
                  break;
                }
              }
            }
          }
          if (extractedDate) {
            console.log("Regex fallback successfully extracted date from user prompt:", extractedDate);
            filterMetadata.start_date = extractedDate;
            filterMetadata.end_date = extractedDate;
          }
        } catch (fallbackErr) {
          console.error("Error in regex fallback date extraction:", fallbackErr);
        }
      }

      if (filterMetadata.start_date) {
        const startParsed = new Date(`${filterMetadata.start_date}T00:00:00Z`).getTime();
        if (isNaN(startParsed)) {
          delete filterMetadata.start_date;
        }
      }
      if (filterMetadata.end_date) {
        const endParsed = new Date(`${filterMetadata.end_date}T23:59:59Z`).getTime();
        if (isNaN(endParsed)) {
          delete filterMetadata.end_date;
        }
      }
      if (filterMetadata.countries) {
        if (typeof filterMetadata.countries === "string") {
          filterMetadata.countries = [filterMetadata.countries];
        } else if (!Array.isArray(filterMetadata.countries)) {
          delete filterMetadata.countries;
        }
      }
      if (!filterMetadata.semantic_query || typeof filterMetadata.semantic_query !== "string") {
        filterMetadata.semantic_query = "public holiday";
      }
    } else {
      filterMetadata = { semantic_query: "public holiday" };
    }

    console.log("Extracted Metadata:", filterMetadata);

    // Step 2: Generate Embedding for the semantic query
    console.log("Step 2: Generating embedding...");
    const embedRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBED_MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: [filterMetadata.semantic_query] })
      }
    );
    if (!embedRes.ok) throw new Error("Failed embedding: " + await embedRes.text());
    const embedData = await embedRes.json() as any;
    const vector = embedData.result?.data?.[0] || embedData.result?.[0];

    // Step 3: Query Vectorize
    console.log("Step 3: Querying Vectorize...");
    const metadataFilters: any = {};
    if (filterMetadata.start_date || filterMetadata.end_date) {
      metadataFilters.timestamp = {};
      if (filterMetadata.start_date) {
        metadataFilters.timestamp.$gte = Math.floor(new Date(`${filterMetadata.start_date}T00:00:00Z`).getTime() / 1000);
      }
      if (filterMetadata.end_date) {
        metadataFilters.timestamp.$lte = Math.floor(new Date(`${filterMetadata.end_date}T23:59:59Z`).getTime() / 1000);
      }
    }
    if (filterMetadata.countries && filterMetadata.countries.length > 0) {
      metadataFilters.country = { $in: filterMetadata.countries };
    }

    const { env } = getCloudflareContext();
    const vectorizeIndex = (env as any).VECTORIZE_INDEX;

    if (!vectorizeIndex) {
      throw new Error("VECTORIZE_INDEX binding is not available.");
    }

    const vectorizeRes = await vectorizeIndex.query(vector, {
      topK: 10,
      returnValues: false,
      returnMetadata: "all",
      filter: Object.keys(metadataFilters).length > 0 ? metadataFilters : undefined
    });

    const matches = vectorizeRes.matches || [];

    // Format matches for LLM context
    const retrievedContext = matches.map((m: any) => {
      const c = m.metadata;
      // m.id format is YYYY-MM-DD-Holiday-Name-Country
      return `- Date: ${c.date}, Holiday ID: ${m.id}, Country: ${c.country} (Score: ${m.score.toFixed(3)})`;
    }).join("\n");

    console.log("Retrieved Context:\n" + retrievedContext);

    // Step 4: Final Synthesized Answer
    console.log("Step 4: Synthesizing final answer...");
    const synthesisSystemPrompt = `You are a helpful holiday assistant. Answer the user's question using ONLY the provided holiday context retrieved from our database. Do not hallucinate holidays not listed in the context. If the context is empty or doesn't answer the question, say so.`;
    const synthesisUserPrompt = `User question: "${userPrompt}"\n\nRetrieved Holiday Context:\n${retrievedContext ? retrievedContext : "No holidays matched."}\n\nPlease provide a clear, concise answer.`;

    const synthesisRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${LLM_MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: synthesisSystemPrompt },
            { role: "user", content: synthesisUserPrompt }
          ]
        })
      }
    );

    if (!synthesisRes.ok) throw new Error("Failed synthesis: " + await synthesisRes.text());
    const synthesisData = await synthesisRes.json() as any;

    return NextResponse.json({
      source: "rag",
      result: synthesisData.result?.response ?? "No results returned.",
      extracted_metadata: filterMetadata,
      vector_search_results: matches
    });

  } catch (error) {
    console.error("Error executing POST:", error instanceof Error ? error.stack : error);
    return NextResponse.json(
      { error: "Failed to process RAG request", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
