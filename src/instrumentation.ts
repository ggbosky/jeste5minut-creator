export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverRenders } = await import("./lib/pipeline");
    recoverRenders();
  }
}
