import express from "express";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, game: "backgammon" });
});

const port = Number(process.env.PORT ?? 4002);
app.listen(port, "0.0.0.0", () => {
  console.log(`Backgammon engine listening on http://0.0.0.0:${port}`);
});
