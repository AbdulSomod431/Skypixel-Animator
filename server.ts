import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    return res.status(500).json({ error: "Supabase not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." });
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

async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Start server if running directly
if (import.meta.url === `file://${process.argv[1]}` || process.env.NODE_ENV !== "production") {
  setupVite().then(() => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

export default app;
