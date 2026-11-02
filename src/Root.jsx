import { Suspense, lazy } from "react";
import ReiPosting from "./ReiPosting";

// The app is loaded on demand so the public posting — scanned on a phone at a
// field gate, often on one bar of signal — doesn't pull the whole authed bundle.
const AnaquaFarmsAppTicket = lazy(() => import("./AnaquaFarms_AppTicket"));

// /r/<token> is the QR posting. It renders instead of the app, never alongside it:
// on that path there is no supabase client, no session and nothing else to reach.
const postingToken = () => {
  const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]{16,64})\/?$/);
  return m ? m[1] : null;
};

export default function Root() {
  const token = postingToken();
  if (token) return <ReiPosting token={token} />;
  return (
    <Suspense fallback={null}>
      <AnaquaFarmsAppTicket />
    </Suspense>
  );
}
