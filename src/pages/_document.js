import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="NEXUS REFACTOR — Multi-Agent Code Refactoring System. AI-powered swarm intelligence for autonomous codebase analysis, refactoring, testing, and documentation." />
        <meta name="author" content="Oke Iyanuoluwa Enoch" />
        <meta property="og:title" content="NEXUS REFACTOR — Multi-Agent Code Intelligence" />
        <meta property="og:description" content="8 specialized AI agents analyze, refactor, test, and document your codebase autonomously." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
