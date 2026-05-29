/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start",
      startServerReadyPattern: "ready on",
      url: ["http://localhost:3000"],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--no-sandbox",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.7 }],
        "categories:accessibility": ["error", { minScore: 0.85 }],
        "categories:best-practices": ["error", { minScore: 0.8 }],
        "categories:seo": ["error", { minScore: 0.85 }],
        "first-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.15 }],
        "total-blocking-time": ["warn", { maxNumericValue: 500 }],
        "interactive": ["warn", { maxNumericValue: 5000 }],
        "max-potential-fid": ["warn", { maxNumericValue: 200 }],
        "bootup-time": ["warn", { maxNumericValue: 2000 }],
        "mainthread-work-breakdown": ["warn", { maxNumericValue: 4000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
