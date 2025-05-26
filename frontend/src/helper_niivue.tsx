export async function fetchJSON(fnm: string): Promise<any> {
    try {
        const response = await fetch(fnm);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return await response.json();
    } catch (e) {
        console.error(`Fetch failed for ${fnm}:`, e);
        throw new Error(e as string);
    }
}