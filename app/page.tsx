"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
export default function Login() {
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const router = useRouter();
  async function submit(e: FormEvent) { e.preventDefault(); setError(""); const r = await fetch("/api/login", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({password}) }); if (r.ok) router.push("/report"); else setError("Invalid password."); }
  return <main className="center"><form className="card login" onSubmit={submit}><h1>Donation Validation</h1><p>Secure reporting portal</p><label>Website password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoFocus /></label>{error&&<div className="error">{error}</div>}<button>Sign in</button></form></main>;
}
