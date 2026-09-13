import { getDeployStore, getStore } from "@netlify/blobs";

export function galleryStore(context: any) {
  return context?.deploy?.context === "production"
    ? getStore("yupoo-august-gallery")
    : getDeployStore("yupoo-august-gallery");
}

