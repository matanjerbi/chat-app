// Thin proxy: serves the Klik app (worker "blush") under a clean pages.dev address.
export default {
  fetch(request, env) {
    return env.APP.fetch(request);
  },
};
