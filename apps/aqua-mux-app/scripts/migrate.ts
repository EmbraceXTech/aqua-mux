import { openManagedStore } from "../lib/server/store";

const store = openManagedStore();
store.close();
console.log("Applied managed-store migrations.");
