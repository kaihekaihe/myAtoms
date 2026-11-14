/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // better-sqlite3 是原生模块，交给 Node 运行时加载，不做打包
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;