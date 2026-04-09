export interface SavedImage {
  id: string;
  name: string;
  data: string;
  timestamp: number;
}

export async function saveImage(name: string, data: string): Promise<SavedImage> {
  const newImage: SavedImage = {
    id: crypto.randomUUID(),
    name,
    data,
    timestamp: Date.now(),
  };
  
  const response = await fetch("/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newImage),
  });

  if (!response.ok) {
    throw new Error("Failed to save image to database");
  }

  return newImage;
}

export async function getSavedImages(): Promise<SavedImage[]> {
  const response = await fetch("/api/images");
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch images from database");
  }
  return await response.json();
}

export async function deleteImage(id: string): Promise<void> {
  const response = await fetch(`/api/images/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete image from database");
  }
}
