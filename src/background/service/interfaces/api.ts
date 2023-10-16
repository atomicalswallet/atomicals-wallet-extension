import { UTXO } from './utxo';

export { UTXO };

export interface IUnspentResponse {
  confirmed: number;
  unconfirmed: number;
  balance: number;
  utxos: UTXO[];
}

export interface ElectrumApiInterface {
  close: () => Promise<void>;
  open: () => Promise<void | boolean>;
  getUrl: () => string;
  setUrl: (url: string) => void;
  resetConnection: () => Promise<void | boolean>;
  reset: () => void;
  isOpen: () => boolean;
  sendTransaction: (rawtx: string) => Promise<string>;
  getUnspentAddress: (address: string) => Promise<IUnspentResponse>;
  getUnspentScripthash: (address: string) => Promise<IUnspentResponse>;
  waitUntilUTXO: (
    address: string,
    satoshis: number,
    sleepTimeSec: number,
    exactSatoshiAmount?: boolean
  ) => Promise<any>;
  getTx: (txid: string, verbose?: boolean) => Promise<any>;
  serverVersion: () => Promise<any>;
  broadcast: (rawtx: string) => Promise<any>;
  history: (scripthash: string) => Promise<any>;
  // Atomicals API
  atomicalsGetGlobal: () => Promise<any>;
  atomicalsGet: (atomicalAliasOrId: string | number) => Promise<any>;
  atomicalsGetLocation: (atomicalAliasOrId: string | number) => Promise<any>;
  atomicalsGetState: (atomicalAliasOrId: string | number, path: string, verbose: boolean) => Promise<any>;
  atomicalsGetStateHistory: (atomicalAliasOrId: string | number) => Promise<any>;
  atomicalsGetEventHistory: (atomicalAliasOrId: string | number) => Promise<any>;
  atomicalsGetTxHistory: (atomicalAliasOrId: string | number) => Promise<any>;
  atomicalsList: (limit: number, offset: number, asc: boolean) => Promise<any>;
  atomicalsByScripthash: (scripthash: string, verbose?: boolean) => Promise<any>;
  atomicalsByAddress: (address: string) => Promise<any>;
  atomicalsAtLocation: (location: string) => Promise<any>;
  atomicalsGetByRealm: (realm: string) => Promise<any>;
  atomicalsGetRealmInfo: (realmOrSubRealm: string, verbose?: boolean) => Promise<any>;
  atomicalsGetByTicker: (ticker: string) => Promise<any>;
  atomicalsGetByContainer: (container: string) => Promise<any>;
  atomicalsFindTickers: (tickerPrefix: string | null, asc?: boolean) => Promise<any>;
  atomicalsFindContainers: (containerPrefix: string | null, asc?: boolean) => Promise<any>;
  atomicalsFindRealms: (realmPrefix: string | null, asc?: boolean) => Promise<any>;
  atomicalsFindSubRealms: (
    parentRealmId: string,
    subrealmPrefix: string | null,
    mostRecentFirst?: boolean
  ) => Promise<any>;
}

export interface IAtomicalBalanceSummary {
  confirmed: number;
  type: 'FT' | 'NFT';
  atomical_number?: number;
  atomical_id?: number;
  $ticker?: string;
  $container?: string;
  $realm?: string;
  utxos: any[];
}


export interface IAtomicalBalances {
  [AtomId: string]: IAtomicalItem;
}

enum TickerStatus {
  'verified' = 'verified',
}

export interface TickerCandidate {
  atomical_id: string;
  commit_height: number;
  reveal_location_height: number;
  tx_num: number;
  txid: string;
}


// export interface IAtomicalBalanceItemData {
//   $bitwork?: {
//     bitworkc?: string;
//     birworkr?: string;
//   };
//   $max_mints?: number;
//   $max_supply?: number;
//   $mint_amount?: number;
//   $mint_bitworkc?: string;
//   $mint_height?: number;
//   $request_ticker?: string;
//   $request_ticker_status?: {
//     status?: TickerStatus;
//     note: string;
//     verified_atomical_id: string;
//   };
//   $ticker: string;
//   $ticker_candidate: TickerCandidate[];
//   atomical_id: string;
//   atomical_number: number;
//   atomical_ref: string;
//   confirmed: boolean;
//   mint_data?: any; // todo
//   mint_info?: MintInfo; // dodo
//   subtype: 'decentralized';
//   type: 'FT' | 'NFT';
//   // todo
//   $container?: string;
//   $realm?: string;
// }

export interface Bitwork {
  bitworkc?: string;
  bitworkr?: string;
}

export interface Legal {
  terms: string;
}

export interface Meta {
  name: string;
  description: string;
  legal: Legal;
}

export interface Args {
  mint_amount: number;
  mint_height: number;
  max_mints: number;
  mint_bitworkc: string;
  request_ticker: string;
  bitworkc: string;
  nonce: number;
  time: number;
}

export interface MintInfo {
  commit_txid: string;
  commit_index: number;
  commit_location: string;
  commit_tx_num: number;
  commit_height: number;
  reveal_location_txid: string;
  reveal_location_index: number;
  reveal_location: string;
  reveal_location_tx_num: number;
  reveal_location_height: number;
  reveal_location_header: string;
  reveal_location_blockhash: string;
  reveal_location_scripthash: string;
  reveal_location_script: string;
  reveal_location_value: number;
  args: Args;
  meta: Meta;
  ctx: {};
  reveal_location_address?: string;
  blockheader_info?: {
    version?: number;
    prevHash?: string;
    merkleRoot?: string;
    timestamp?: number;
    bits?: number;
    nonce?: number;
  };
  $request_realm?: string;
  $request_subrealm?: string;
  $request_container?: string;
  $request_ticker?: string;
  $pid?: string;
  $mint_bitworkc: string;
  $bitwork: Bitwork;
}

export interface Location {
  location: string;
  txid: string;
  index: number;
  scripthash: string;
  value: number;
  script: string;
  address?: string;
  atomicals_at_location?: any[];
  tx_num?: number;
  adddress?: string;
}

export interface LocationInfo {
  locations: Location[];
}

export interface MintDataSummary {
  fields: { [key: string]: any };
}

export interface StateInfo {
}

export interface RuleSet {
  pattern: string;
  outputs: Array<{
    v: number;
    s: string;
  }>;
}

export interface ApplicableRule {
  rule_set_txid: string;
  rule_set_height: number;
  rule_valid_from_height: number;
  matched_rule: RuleSet;
}

export interface SubrealmCandidate {
  tx_num: number;
  atomical_id: string;
  txid: string;
  commit_height: number;
  reveal_location_height: number;
  payment?: string;
  payment_type: string;
  make_payment_from_height: number;
  payment_due_no_later_than_height: string;
  applicable_rule?: ApplicableRule;
}

export interface RequestSubrealmStatus {
  status:
    | 'verified'
    | 'expired_revealed_late'
    | 'expired_payment_not_received'
    | 'claimed_by_other'
    | 'invalid_request_subrealm_no_matched_applicable_rule'
    | 'pending_awaiting_confirmations_payment_received_prematurely'
    | 'pending_awaiting_confirmations_for_payment_window'
    | 'pending_awaiting_confirmations'
    | 'pending_awaiting_payment'
    | string;
  verified_atomical_id?: string;
  claimed_by_atomical_id?: string;
  pending_candidate_atomical_id?: string;
  pending_claimed_by_atomical_id?: string;
  note?: string;
}

export interface RequestNameStatus {
  status:
    | 'verified'
    | 'expired_revealed_late'
    | 'claimed_by_other'
    | 'pending_candidate'
    | 'pending_claimed_by_other'
    | string;
  verified_atomical_id?: string;
  claimed_by_atomical_id?: string;
  pending_candidate_atomical_id?: string;
  note?: string;
}

export interface NameCandidate {
  tx_num: number;
  atomical_id: string;
  txid: string;
  commit_height: number;
  reveal_location_height: number;
}

export interface IAtomicalBalanceItemData {
  confirmed: boolean;
  atomical_id: string;
  atomical_number: number;
  atomical_ref: string;
  type: 'NFT' | 'FT';
  subtype?:
    | 'request_realm'
    | 'realm'
    | 'request_subrealm'
    | 'subrealm'
    | 'request_container'
    | 'container'
    | 'direct'
    | 'decentralized';
  location_info_obj?: LocationInfo;
  mint_info?: MintInfo;
  mint_data?: MintDataSummary;
  state_info?: StateInfo;
  // Relationships
  $relns?: { [key: string]: any };
  // Bitwork proof of work
  $bitwork?: Bitwork;
  // realms
  $request_realm_status?: RequestNameStatus;
  $realm_candidates?: NameCandidate[];
  $request_realm?: string;
  $realm?: string;
  // Subrealm
  $full_realm_name?: string; // applies to realms and subrealms both
  $request_full_realm_name?: string;
  $subrealm_candidates?: SubrealmCandidate[];
  $request_subrealm_status?: RequestSubrealmStatus;
  $request_subrealm?: string;
  $pid?: string;
  $subrealm?: string;
  // tickers
  $max_supply?: number;
  $mint_height?: number;
  $mint_amount?: number;
  $max_mints?: number;
  $mint_bitworkc?: string;
  $mint_bitworkr?: string;
  $ticker_candidates?: NameCandidate[];
  $request_ticker_status?: RequestNameStatus;
  $request_ticker?: string;
  $ticker?: string;
  // containers
  $request_container_status?: RequestNameStatus;
  $container_candidates?: NameCandidate[];
  $request_container?: string;
  $container?: string;
}

export interface IAtomicalItem {
  confirmed: boolean;
  value: number;
  atomical_id: string;
  atomical_number: number;
  atomical_ref: string;
  type: 'NFT' | 'FT';
  subtype?:
    | 'request_realm'
    | 'realm'
    | 'request_subrealm'
    | 'subrealm'
    | 'request_container'
    | 'container'
    | 'direct'
    | 'decentralized';
  location_info_obj?: LocationInfo;
  mint_info?: MintInfo;
  mint_data?: MintDataSummary;
  state_info?: StateInfo;
  // Relationships
  $relns?: { [key: string]: any };
  // Bitwork proof of work
  $bitwork?: Bitwork;
  // realms
  $request_realm_status?: RequestNameStatus;
  $realm_candidates?: NameCandidate[];
  $request_realm?: string;
  $realm?: string;
  // Subrealm
  $full_realm_name?: string; // applies to realms and subrealms both
  $request_full_realm_name?: string;
  $subrealm_candidates?: SubrealmCandidate[];
  $request_subrealm_status?: RequestSubrealmStatus;
  $request_subrealm?: string;
  $pid?: string;
  $subrealm?: string;
  // tickers
  $max_supply?: number;
  $mint_height?: number;
  $mint_amount?: number;
  $max_mints?: number;
  $mint_bitworkc?: string;
  $mint_bitworkr?: string;
  $ticker_candidates?: NameCandidate[];
  $request_ticker_status?: RequestNameStatus;
  $request_ticker?: string;
  $ticker?: string;
  // containers
  $request_container_status?: RequestNameStatus;
  $container_candidates?: NameCandidate[];
  $request_container?: string;
  $container?: string;
}


export type IMergedAtomicals = UTXO & {
  atomicals: IAtomicalItem[];
}


export interface IWalletBalance {
  atomicalMerged: IMergedAtomicals[];
  atomicalNFTs: IAtomicalItem[];
  scripthash: string;
  output: string | Buffer;
  address: string;
  atomicalsUTXOs: UTXO[];
  atomicalsValue?: number;
  regularsUTXOs: UTXO[];
  atomicalFTs: (IAtomicalItem & { utxos: UTXO[] })[];
  ordinalsValue: number;
  confirmedUTXOs: UTXO[];
  unconfirmedUTXOs: UTXO[];
  ordinalsUTXOs: UTXO[];
  atomicalsWithOrdinalsValue: number;
  confirmedValue: number;
  regularsValue: number;
  unconfirmedValue: number;
  atomicalsWithOrdinalsUTXOs: UTXO[];
}

export type TxItem = {
  locktime: number;
  size: number;
  fee: number;
  txid: string;
  weight: number;
  vin: {
    scriptsig: string;
    witness: string[];
    sequence: number;
    scriptsig_asm: string;
    prevout: {
      scriptpubkey_address: string;
      scriptpubkey: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      value: number
    };
    is_coinbase: boolean;
    txid: string;
    vout: number
  }[];
  version: number;
  vout: {
    scriptpubkey_address: string;
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    value: number
  }[];
  status: { confirmed: boolean }
}