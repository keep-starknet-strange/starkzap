import { mount } from "svelte";
import "./lib/theme.css";
import App from "./App.svelte";
import { autoConnect } from "./lib/stores/wallet";

const target = document.getElementById("app");
if (!target) throw new Error("#app root not found");

const app = mount(App, { target });

// Sign in from VITE_PRIVATE_KEY / VITE_ACCOUNT_PRESET when configured.
void autoConnect();

export default app;
