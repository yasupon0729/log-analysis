import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 15 では serverExternalPackages を使用
  output: "standalone",
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
      config.resolve ??= {};
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
      const externalEntry = {
        pino: "commonjs pino",
        "thread-stream": "commonjs thread-stream",
        "pino-pretty": "commonjs pino-pretty",
        "pino-roll": "commonjs pino-roll",
        "sonic-boom": "commonjs sonic-boom",
        "pino-abstract-transport": "commonjs pino-abstract-transport",
        encoding: "commonjs encoding",
      } as const;

      if (Array.isArray(config.externals)) {
        config.externals.push(externalEntry);
      } else if (config.externals) {
        config.externals = [config.externals, externalEntry];
      } else {
        config.externals = [externalEntry];
      }
    }

    return config;
  },
};

export default nextConfig;
