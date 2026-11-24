/** Hand a Blob to the browser as a file download, then let go of it */
export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Some browsers start the save after the click returns
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
