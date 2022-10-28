import { logger } from "@/common/logger";
import type { HandlerQueue } from "@/core/queues/handlerQueue";
import type { CacheStore } from "@/db/cacheStore";
import type { Source } from "@/sources/base";

import { createBlockFrontfillQueue } from "../queues/blockFrontfillQueue";
import type { CachedProvider } from "./CachedProvider";

let previousProviders: CachedProvider[] = [];

export const buildLiveBlockQueues = async ({
  sources,
  cacheStore,
  handlerQueue,
}: {
  sources: Source[];
  cacheStore: CacheStore;
  handlerQueue: HandlerQueue;
}) => {
  // Unregister block listeners for stale providers.
  for (const provider of previousProviders) {
    provider.removeAllListeners();
  }
  previousProviders = [];
  for (const source of sources) {
    previousProviders.push(source.network.provider);
  }

  const uniqueNetworks = [
    ...new Map(sources.map((s) => s.network).map((n) => [n.name, n])).values(),
  ];

  const latestBlockNumberByNetwork: Record<string, number | undefined> = {};

  const liveNetworkStatuses = await Promise.all(
    uniqueNetworks.map(async (network) => {
      const contractAddresses = sources
        .filter((s) => s.network.name === network.name)
        .map((source) => source.address);

      // Kinda weird but should work to make sure this RPC request gets done
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      let latestBlockNumber: number = null!;
      let isLatestBlockRequestSuccessful = false;
      while (!isLatestBlockRequestSuccessful) {
        try {
          const latestBlock = await network.provider.getBlock("latest");
          latestBlockNumber = latestBlock.number;
          isLatestBlockRequestSuccessful = true;
        } catch (err) {
          logger.error(
            `Failed to fetch latest block for network [${network.name}], retrying...`
          );
          isLatestBlockRequestSuccessful = false;
        }
      }

      latestBlockNumberByNetwork[network.name] = latestBlockNumber;

      const liveBlockRequestQueue = createBlockFrontfillQueue({
        cacheStore,
        network,
        contractAddresses,
        handlerQueue,
      });

      // Pause the live block request queue, but begin adding tasks to it.
      // Once the backfill is complete, unpause it to process the backlog of
      // tasks that were added during backfill + new live logs.
      liveBlockRequestQueue.pause();
      network.provider.on("block", (blockNumber: number) => {
        // Messy way to avoid double-processing latestBlockNumber.
        // Also noticed taht this approach sometimes skips the block
        // immediately after latestBlockNumber.
        if (blockNumber > latestBlockNumber) {
          liveBlockRequestQueue.push({ blockNumber });
        }
      });

      return {
        networkName: network.name,
        latestBlockNumber,
        liveBlockRequestQueue,
      };
    })
  );

  const resumeLiveBlockQueues = () => {
    // Begin processing live blocks for all source groups. This includes
    // any blocks that were fetched and enqueued during the backfill.
    liveNetworkStatuses.forEach((status) => {
      status.liveBlockRequestQueue.resume();
    });
  };

  return {
    latestBlockNumberByNetwork,
    resumeLiveBlockQueues,
  };
};
