import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: any = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const app = express();
app.use(express.json({ limit: '50mb' }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    supabaseConfigured: !!supabase,
    env: process.env.NODE_ENV 
  });
});

app.get("/api/images", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel Environment Variables." });
  }
  try {
    const { data, error } = await supabase
      .from("images")
      .select("*")
      .order("timestamp", { ascending: false });
    
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error("Supabase error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch images" });
  }
});

app.post("/api/images", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured." });
  }
  const { id, name, data: imageData, timestamp } = req.body;
  try {
    const { error } = await supabase
      .from("images")
      .insert([{ id, name, data: imageData, timestamp }]);
    
    if (error) throw error;
    res.json({ id, name, data: imageData, timestamp });
  } catch (error: any) {
    console.error("Supabase error:", error);
    res.status(500).json({ error: error.message || "Failed to save image" });
  }
});

app.delete("/api/images/:id", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured." });
  }
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from("images")
      .delete()
      .eq("id", id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Supabase error:", error);
    res.status(500).json({ error: error.message || "Failed to delete image" });
  }
});

// For local development
if (process.env.NODE_ENV !== "production") {
  const PORT = 3001; // Use a different port for the API in dev
  app.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`);
  });
}

export default app;
