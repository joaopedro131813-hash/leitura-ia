/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  output: "export",
  reactCompiler: true,
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
