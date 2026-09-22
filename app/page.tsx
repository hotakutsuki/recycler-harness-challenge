import { redirect } from "next/navigation";

export default function Home() {
  // Capture is the only screen that does anything yet; the inbox, the reports and
  // the configuration screen land as the pipeline behind them is built.
  redirect("/capture");
}
