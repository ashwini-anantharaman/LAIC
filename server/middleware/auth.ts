import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../lib/config.js";

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice(7);
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid token" });
  }
  req.userId = data.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  req.userRole = profile?.role;
  next();
}
