import { AbiEvent, parseAbiItem } from "abitype";
import { Abi, Address, encodeEventTopics, getAbiItem, Hex } from "viem";

import { toLowerCase } from "@/utils/lowercase";

import { AbiEvents, getEvents } from "./abi";
import { ResolvedConfig } from "./config";
import { buildFactoryCriteria } from "./factories";

/**
 * There are up to 4 topics in an EVM event
 *
 * @todo Change this to a more strict type
 */
export type Topics = (Hex | Hex[] | null)[];

export type LogFilterCriteria = {
  address?: Address | Address[];
  topics?: Topics;
};

export type FactoryCriteria = {
  address: Address;
  eventSelector: Hex;
  childAddressLocation: "topic1" | "topic2" | "topic3" | `offset${number}`;
  topics?: Topics;
};

type BaseSource = {
  name: string;
  network: string;
  chainId: number;
  abi: Abi;
  events: AbiEvents;
  startBlock: number;
  endBlock?: number;
  maxBlockRange?: number;
};

export type LogFilter = BaseSource & {
  type: "logFilter";
  criteria: LogFilterCriteria;
};

export type Factory = BaseSource & {
  type: "factory";
  criteria: FactoryCriteria;
};

export type Source = LogFilter | Factory;

export const sourceIsLogFilter = (source: Source): source is LogFilter =>
  source.type === "logFilter";

export const sourceIsFactory = (source: Source): source is Factory =>
  source.type === "factory";

export const buildSources = ({
  config,
}: {
  config: ResolvedConfig;
}): Source[] => {
  const contracts = config.contracts ?? [];

  return contracts
    .map((contract) => {
      // Note: should we filter down which indexing functions are available based on the filters
      const events = getEvents({ abi: contract.abi });

      // Resolve the contract per network, filling in default values where applicable
      return contract.network
        .map((networkContract) => {
          // Note: this is missing config validation for checking if the network is valid
          const network = config.networks.find(
            (n) => n.name === networkContract.name
          )!;

          const resolvedFilter = networkContract.filter ?? contract.filter;

          const topics = resolvedFilter
            ? buildTopics(contract.abi, resolvedFilter)
            : undefined;

          const sharedSource = {
            // constants
            name: contract.name,
            abi: contract.abi,
            network: network.name,
            chainId: network.chainId,
            events,
            // optionally overridden properties
            startBlock: networkContract.startBlock ?? contract.startBlock ?? 0,
            endBlock: networkContract.endBlock ?? contract.endBlock,
            maxBlockRange:
              networkContract.maxBlockRange ?? contract.maxBlockRange,
          } as const;

          if ("factory" in contract) {
            // factory

            const resolvedFactory =
              ("factory" in networkContract && networkContract.factory) ||
              contract.factory;

            return {
              ...sharedSource,
              type: "factory",
              criteria: {
                ...buildFactoryCriteria(resolvedFactory),
                topics,
              },
            } as const satisfies Factory;
          } else {
            // log filter

            const resolvedAddress =
              ("address" in networkContract && networkContract.address) ||
              contract.address;

            return {
              ...sharedSource,
              type: "logFilter",
              criteria: {
                address: resolvedAddress
                  ? toLowerCase(resolvedAddress)
                  : undefined,
                topics,
              },
            } as const satisfies LogFilter;
          }
        })
        .flat();
    })
    .flat();
};

const buildTopics = (
  abi: Abi,
  events: NonNullable<
    NonNullable<ResolvedConfig["contracts"]>[number]["filter"]
  >
): Topics => {
  if (Array.isArray(events)) {
    // List of event signatures
    return [
      events
        .map((event) =>
          encodeEventTopics({
            abi: [findAbiEvent(abi, event)],
          })
        )
        .flat(),
    ];
  } else {
    // Single event with args
    return encodeEventTopics({
      abi: [findAbiEvent(abi, events.event)],
      args: events.args,
    });
  }
};

/**
 * Finds the abi event for the event string
 *
 * @param eventName Event name or event signature if there are collisions
 */
const findAbiEvent = (abi: Abi, eventName: string): AbiEvent => {
  if (eventName.includes("(")) {
    // Collision
    return parseAbiItem(`event ${eventName}`) as AbiEvent;
  } else {
    return getAbiItem({ abi, name: eventName }) as AbiEvent;
  }
};
