import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://nyuriwossan.github.io/lora-training-prompt-workshop"),
  title: "LoRA学習プロンプト工房",
  description: "LoRAに覚えさせたい特徴と固定させたくない特徴を分け、学習画像セット全体の偏りを制御する設計ツール。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "LoRA学習プロンプト工房",
    description: "偏りを防ぐ学習データ設計ツール",
    type: "website",
    locale: "ja_JP",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "LoRA学習プロンプト工房 — 偏りを防ぐ学習データ設計ツール" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LoRA学習プロンプト工房",
    description: "偏りを防ぐ学習データ設計ツール",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
