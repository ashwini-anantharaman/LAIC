import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { config } from "../lib/config.js";

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
}

/**
 * M4 LR1: allow the Generalizable Coach (a trusted server-to-server caller) to
 * reach coach-facing endpoints with a shared service token, OR fall back to a
 * normal authenticated learner. The Coach presents `Bearer <COACH_SERVICE_TOKEN>`.
 */
export async function requireServiceOrAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (config.coachServiceToken && token && token === config.coachServiceToken) {
    req.userId = "coach-service";
    req.userRole = "service";
    return next();
  }
  return requireAuth(req, res, next);
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
