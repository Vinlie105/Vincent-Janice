// config.js: the only file you need to edit
window.APP_CONFIG = {
  names: ["Vincent", "Janice"],
  startDate: "2026-10-16",
  birthdays: { Vincent: "02-01", Janice: "03-23" },
  trip: {
    arrive: "2026-12-03T12:25:00+07:00",
    leave: "2026-12-22T14:15:00+07:00"
  },
  timezones: { Vincent: "Asia/Singapore", Janice: "Asia/Jakarta" },

  // Safe to be public. Never put the service_role key here.
  supabaseUrl: "https://fpfeswlsyxqsslqpgbph.supabase.co",
  supabaseAnonKey: "sb_publishable_lNz9pYhL4IFAr7CQfYbhLw_UnZOtxsm",

  // Public key for notifications. The private half lives only in Supabase.
  vapidPublicKey: "BCToFc6E6dzYgXyBesKjqSUndYKYWZzK6OsPNecSD9E0XyP6qMP-q_jZ7oY62eoE96oBbxbP_pWlCe5inzXnU68"
};
