/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource-variable/jetbrains-mono";

import "./styles/app.css";

render(() => <App />, document.getElementById("root") as HTMLElement);
