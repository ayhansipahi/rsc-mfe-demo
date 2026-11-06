// The shell's web function: it serves the header and footer fragments, nothing else. Pages are the
// apps' business. Lambda Web Functions load index.js and probe AWS_LAMBDA_HTTP_ENDPOINT.
import express from "express";

const [host, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT || `0.0.0.0:${process.env.PORT ?? 3000}`).split(":");

const app = express();
// Which deployable answered: visible in response headers, so the split can be shown, not asserted.
app.use((_req, res, next) => { res.setHeader("x-vertical", "shell-web"); next(); });
// Not content-hashed, so a short TTL: a shell change is live within about two minutes (edge plus
// browser). CORS is for an app running standalone with SHELL_ORIGIN on another port; in production
// everything is one host. ponytail: version the URLs if instant rollout ever matters.
app.use(
  "/shell-static/fragments",
  express.static("build/fragments", {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.setHeader("Access-Control-Allow-Origin", "*");
    },
  }),
);
app.listen(port, host, () => console.log(`listening on ${host}:${port}`));
