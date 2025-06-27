// @ts-check
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";
// import theme from "starlight-nextjs-theme";
// import theme from 'starlight-theme-flexoki';
// import theme from 'starlight-theme-rapide';
// import theme from 'starlight-theme-obsidian';
import theme from 'starlight-theme-nova';

// import { ion as theme } from "starlight-ion-theme";


// https://astro.build/config
export default defineConfig({
  site: "https://alchemy.run",
  // only needed if we use SSR
  // adapter: cloudflare({
  //   imageService: "passthrough",
  // }),
  prefetch: true,
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith(".html") && !page.endsWith(".md"),
    }),
    // expressiveCode({
    //   themes: [{}]
    // }),
    starlight({
      title: "Alchemy",
      favicon: "/potion.png",
      
      logo: {
        light: "./public/alchemy-logo-light.svg",
        dark: "./public/alchemy-logo-dark.svg",
        replacesTitle: true,
      },
      customCss: [
        './src/styles/custom.css',
      ],
      prerender: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/sam-goodwin/alchemy",
        },
        {
          icon: "twitter",
          label: "X",
          href: "https://twitter.com/samgoodwin89",
        },
        {
          icon: "discord",
          label: "Discord",
          href: "https://discord.gg/jwKw8dBJdN",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/sam-goodwin/alchemy/edit/main/alchemy-web",
      },
      components: {
        Hero: "./src/components/Hero.astro",
      },
      sidebar: [
        {
          label: "What is Alchemy?",
          slug: "what-is-alchemy",
        },
        {
          label: "Getting Started",
          slug: "getting-started",
        },
        {
          label: "Guides",
          autogenerate: { directory: "guides" },
          collapsed: true,
        },
        {
          label: "Concepts",
          autogenerate: { directory: "concepts" },
        },
        {
          label: "Providers",
          autogenerate: { directory: "providers", collapsed: true },
        },
      ],
      expressiveCode: {
        themes: [
          // "github-light-high-contrast",
          "github-light",
          "github-dark-dimmed",
        ],
      },
      plugins: [theme(), starlightLlmsTxt()],
      head: [
        {
          // Posthog
          tag: "script",
          content: `
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
            posthog.init('phc_1ZjunjRSQE5ij2xv0ir2tATiewyR6hLssSIiKrGQlBi', {
              api_host:'https://ph.alchemy.run',
              defaults: '2025-05-24'
            })
          `
        },
      ],
    }),
  ],
  trailingSlash: "ignore",
});
