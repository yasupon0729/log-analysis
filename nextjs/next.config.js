/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 15 では serverExternalPackages を使用
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "pino-roll",
    "thread-stream",
    "pino-worker",
    "pino-file",
    "sonic-boom",
    "pino-abstract-transport",
    "fast-redact",
    "on-exit-leak-free",
    "pino-std-serializers",
    "quick-format-unescaped",
  ],

  // Webpack 設定でクライアントサイドのバンドルを制御
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // クライアントサイドでは Node.js モジュールを無効化
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
        stream: false,
        crypto: false,
        os: false,
      };
    } else {
      // サーバーサイドでは externals として扱う
      config.externals.push({
        pino: "commonjs pino",
        "thread-stream": "commonjs thread-stream",
        "pino-pretty": "commonjs pino-pretty",
        "pino-roll": "commonjs pino-roll",
        "sonic-boom": "commonjs sonic-boom",
        "pino-abstract-transport": "commonjs pino-abstract-transport",
        encoding: "commonjs encoding",
      });
    }

    return config;
  },
};

module.exports = nextConfig;
