module.exports = {
  apps: [
    {
      name: "activation",
      script: "dist/index.js",
      env: {
        INTERVAL_SECS: 30,
        PEER: "https://canada.signum.network",
        ACTIVATION_ACCOUNT_SEED: "",
        LOGZ_IO_SHIPPING_TOKEN: "",
        CACHE_PATH: "./cache.json",
      },
    },
  ],
};
