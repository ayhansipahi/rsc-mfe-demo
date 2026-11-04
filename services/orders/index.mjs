// Private service: no function URL, no API Gateway, no VPC exposure. The only way in is
// lambda:InvokeFunction, so "who is calling" is settled by IAM before this code runs.
// Identity arrives as data from the web function, which already verified the session.
export const handler = async (event) => {
  const { sub, username } = event ?? {};
  if (!sub) throw new Error("missing identity");
  // Deterministic fake data per user so two sessions never see the same rows.
  const seed = [...sub].reduce((a, c) => a + c.charCodeAt(0), 0);
  const items = ["Keyboard", "Monitor", "Cable"];
  return {
    owner: username,
    orders: items.map((item, i) => ({
      id: `ORD-${((seed + i * 7919) % 46656).toString(36).toUpperCase().padStart(3, "0")}`,
      item,
      total: (seed % 90) + 10 + i * 15,
    })),
  };
};
