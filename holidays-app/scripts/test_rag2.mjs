fetch("http://localhost:3000/api/holidays-rag", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userPrompt: "What public holidays are there in November worldwide?" })
})
.then(r => r.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(console.error);
