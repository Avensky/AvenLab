import express from 'express';
import http from 'http';
import cors from 'cors';

async function startServer() {
  const app = express();
  app.use(cors());
  const httpServer = http.createServer(app);
  httpServer.listen(
    4e3,
    () => console.log("Server running at http://localhost:4000")
  );
}

startServer();
