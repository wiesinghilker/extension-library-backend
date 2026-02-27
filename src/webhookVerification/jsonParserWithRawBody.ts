import express from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export const jsonParserWithRawBody: express.RequestHandler = express.json({
  verify: (req, _res, buf) => {
    (req as express.Request).rawBody = buf;
  },
});
