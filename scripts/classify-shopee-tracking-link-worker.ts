import {
    classifyShopeeTrackingLinkAsync,
  } from "../src/repositories/affiliate-catalog.repository";

  function writeAndExit(
    stream: NodeJS.WriteStream,
    value: unknown,
    exitCode: number,
  ): void {
    stream.write(
      `${JSON.stringify(value)}\n`,
      () => process.exit(exitCode),
    );
  }

  async function main(): Promise<void> {
    const publisherId =
      process.env.TEST_PUBLISHER_ID?.trim();

    const trackingLinkId =
      process.env.TEST_TRACKING_LINK_ID?.trim();

    const offerId =
      process.env.TEST_OFFER_ID?.trim();

    if (!publisherId || !trackingLinkId || !offerId) {
      throw new Error(
        "TEST_PUBLISHER_ID, TEST_TRACKING_LINK_ID, and TEST_OFFER_ID are required",
      );
    }

    const result =
      await classifyShopeeTrackingLinkAsync({
        publisherId,
        trackingLinkId,
        offerId,
      });

    writeAndExit(process.stdout, result, 0);
  }

  main().catch((error: unknown) => {
    const normalized =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
          }
        : {
            name: "UnknownError",
            message: String(error),
          };

    writeAndExit(process.stderr, normalized, 1);
  });
