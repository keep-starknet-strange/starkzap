import { mount } from "svelte";
import "./lib/theme.css";
import App from "./App.svelte";
import { resumeSession } from "./lib/stores/wallet";

const target = document.getElementById("app");
if (!target) throw new Error("#app root not found");

const app = mount(App, { target });

// Resume the last login (or the VITE_PRIVATE_KEY env key) when possible.
void resumeSession();

export default app;
