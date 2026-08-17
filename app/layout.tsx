import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "易搭｜今天穿什么，已经为你搭好";
  const description = "结合天气、可用衣物与个人偏好，从你的衣柜里推荐今天真正能穿的搭配。";

  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "zh_CN", images: [{ url: imageUrl, width: 1200, height: 630, alt: "易搭产品分享封面" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
