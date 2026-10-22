/**
 * Maps Soroban contract errors to human-readable messages for the backend.
 *
 * Typed `#[contracterror]` enums (CarbonError, RewardTokenError, escrow errors)
 * surface as `HostError: Error(Contract, #<code>)`. We decode the numeric code
 * per contract so the backend can distinguish e.g. an expired allowance from
 * insufficient balance instead of seeing a generic `InvalidAction`.
 */

export interface ContractErrorInfo {
  contract: string;
  code: number;
  name: string;
  message: string;
}

/** Stable codes for `contract/carbon-offset` (`CarbonError`). */
export const CarbonErrorCode = {
  AlreadyInitialized: 1,
  NotInitialized: 2,
  Unauthorized: 3,
  InsufficientBalance: 4,
  AllowanceExpired: 5,
  InvalidAmount: 6,
  ProjectNotFound: 7,
  ProjectAlreadyExists: 8,
  InvalidCreditAmount: 9,
  Overflow: 10,
} as const;

/** Stable codes for `contract/reward-token` (`RewardTokenError`). */
export const RewardTokenErrorCode = {
  AlreadyInitialized: 1,
  NotInitialized: 2,
  Unauthorized: 3,
  InsufficientBalance: 4,
  AllowanceExpired: 5,
  MaxSupplyExceeded: 6,
  InvalidAmount: 7,
  Overflow: 8,
} as const;

const CARBON_MESSAGES: Record<number, { name: string; message: string }> = {
  [CarbonErrorCode.AlreadyInitialized]: {
    name: "AlreadyInitialized",
    message: "Carbon-offset contract is already initialized",
  },
  [CarbonErrorCode.NotInitialized]: {
    name: "NotInitialized",
    message: "Carbon-offset contract has not been initialized",
  },
  [CarbonErrorCode.Unauthorized]: {
    name: "Unauthorized",
    message: "Caller is not authorized for this carbon-offset operation",
  },
  [CarbonErrorCode.InsufficientBalance]: {
    name: "InsufficientBalance",
    message: "Insufficient carbon credit balance",
  },
  [CarbonErrorCode.AllowanceExpired]: {
    name: "AllowanceExpired",
    message: "Carbon credit allowance has expired",
  },
  [CarbonErrorCode.InvalidAmount]: {
    name: "InvalidAmount",
    message: "Invalid carbon credit amount",
  },
  [CarbonErrorCode.ProjectNotFound]: {
    name: "ProjectNotFound",
    message: "Carbon offset project not found",
  },
  [CarbonErrorCode.ProjectAlreadyExists]: {
    name: "ProjectAlreadyExists",
    message: "Carbon offset project already exists",
  },
  [CarbonErrorCode.InvalidCreditAmount]: {
    name: "InvalidCreditAmount",
    message: "Invalid carbon credit amount supplied",
  },
  [CarbonErrorCode.Overflow]: {
    name: "Overflow",
    message: "Arithmetic overflow in carbon-offset contract",
  },
};

const REWARD_TOKEN_MESSAGES: Record<number, { name: string; message: string }> = {
  [RewardTokenErrorCode.AlreadyInitialized]: {
    name: "AlreadyInitialized",
    message: "Reward token contract is already initialized",
  },
  [RewardTokenErrorCode.NotInitialized]: {
    name: "NotInitialized",
    message: "Reward token contract has not been initialized",
  },
  [RewardTokenErrorCode.Unauthorized]: {
    name: "Unauthorized",
    message: "Caller is not authorized for this reward-token operation",
  },
  [RewardTokenErrorCode.InsufficientBalance]: {
    name: "InsufficientBalance",
    message: "Insufficient reward token balance",
  },
  [RewardTokenErrorCode.AllowanceExpired]: {
    name: "AllowanceExpired",
    message: "Reward token allowance has expired",
  },
  [RewardTokenErrorCode.MaxSupplyExceeded]: {
    name: "MaxSupplyExceeded",
    message: "Reward token max supply exceeded",
  },
  [RewardTokenErrorCode.InvalidAmount]: {
    name: "InvalidAmount",
    message: "Invalid reward token amount",
  },
  [RewardTokenErrorCode.Overflow]: {
    name: "Overflow",
    message: "Arithmetic overflow in reward-token contract",
  },
};

const CONTRACT_TABLES: Record<string, Record<number, { name: string; message: string }>> = {
  "carbon-offset": CARBON_MESSAGES,
  "reward-token": REWARD_TOKEN_MESSAGES,
};

/**
 * Extracts the numeric contract error code from a Soroban error string such as
 * `HostError: Error(Contract, #5)` or `Error(Contract, #5)`.
 */
export function extractContractErrorCode(error: unknown): number | null {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const match = text.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!match) {
    return null;
  }
  const code = Number.parseInt(match[1], 10);
  return Number.isNaN(code) ? null : code;
}

/**
 * Maps a raw contract error to a typed, human-readable description.
 * Returns `null` when the error is not a recognized typed contract error.
 */
export function mapContractError(
  contract: string,
  error: unknown,
): ContractErrorInfo | null {
  const code = extractContractErrorCode(error);
  if (code === null) {
    return null;
  }

  const table = CONTRACT_TABLES[contract];
  const entry = table?.[code];
  if (!entry) {
    return {
      contract,
      code,
      name: "UnknownError",
      message: `Unknown ${contract} contract error (code ${code})`,
    };
  }

  return { contract, code, name: entry.name, message: entry.message };
}
