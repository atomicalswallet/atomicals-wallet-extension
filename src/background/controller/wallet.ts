/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable indent */
import * as bitcoin from 'bitcoinjs-lib';
import { address as PsbtAddress } from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import {
  contactBookService,
  keyringService,
  notificationService,
  openapiService,
  permissionService,
  preferenceService,
  sessionService
} from '@/background/service';
import i18n from '@/background/service/i18n';
import { DisplayedKeyring, Keyring } from '@/background/service/keyring';
import {
  ADDRESS_TYPES,
  BRAND_ALIAN_TYPE_TEXT,
  CHAINS_ENUM,
  COIN_NAME,
  COIN_SYMBOL,
  ELECTRUMX_HTTP_PROXY,
  KEYRING_TYPE,
  KEYRING_TYPES,
  NETWORK_TYPES,
  OPENAPI_URL_MAINNET,
  OPENAPI_URL_TESTNET
} from '@/shared/constant';
import {
  AddressType,
  BitcoinBalance,
  NetworkType,
  ToSignInput,
  WalletKeyring,
  Account,
  SignPsbtOptions,
  AddressUserToSignInput,
  PublicKeyUserToSignInput,
  AtomNetworkType
} from '@/shared/types';
import { createSplitOrdUtxoV2 } from '@unisat/ord-utils';

import { ContactBookItem } from '../service/contactBook';
import { OpenApiService } from '../service/openapi';
import { ConnectedSite } from '../service/permission';
import { signBip322MessageSimple } from '../utils/bip322';
import { publicKeyToAddress, toPsbtNetwork } from '../utils/tx-utils';
import BaseController from './base';
import { AtomicalService } from '../service/atomical';
import { IAtomicalItem, IMergedAtomicals, IWalletBalance, UTXO as AtomUtxo } from '../service/interfaces/api';
import { MempoolService, mempoolService, mempoolServiceTest } from '../service/mempool';
import { detectAddressTypeToScripthash } from '../service/utils';
import { ElectrumApi } from '../service/eletrum';
// import { AtomicalsInfo } from '../service/interfaces/utxo';

const toXOnly = (pubKey: Buffer) => (pubKey.length === 32 ? pubKey : pubKey.slice(1, 33));

const stashKeyrings: Record<string, Keyring> = {};

const ECPair = ECPairFactory(ecc);

export type AccountAsset = {
  name: string;
  symbol: string;
  amount: string;
  value: string;
};

export class WalletController extends BaseController {
  public atomicalApi: AtomicalService = new AtomicalService(ElectrumApi.createClient(ELECTRUMX_HTTP_PROXY));
  constructor() {
    super();
    // this.init();
  }

  public changeAtomicalEndpoint(url: string) {
    this.atomicalApi = new AtomicalService(ElectrumApi.createClient(url));
  }

  openapi: OpenApiService = openapiService;

  mempoolService: MempoolService = mempoolService;

  /* wallet */
  boot = (password: string) => keyringService.boot(password);
  isBooted = () => keyringService.isBooted();

  getApproval = notificationService.getApproval;
  resolveApproval = notificationService.resolveApproval;
  rejectApproval = notificationService.rejectApproval;

  hasVault = () => keyringService.hasVault();
  verifyPassword = (password: string) => keyringService.verifyPassword(password);
  changePassword = (password: string, newPassword: string) => keyringService.changePassword(password, newPassword);

  initAlianNames = async () => {
    preferenceService.changeInitAlianNameStatus();
    const contacts = this.listContact();
    const keyrings = await keyringService.getAllDisplayedKeyrings();

    keyrings.forEach((v) => {
      v.accounts.forEach((w, index) => {
        this.updateAlianName(w.pubkey, `${BRAND_ALIAN_TYPE_TEXT[v.type]} ${index + 1}`);
      });
    });

    if (contacts.length !== 0 && keyrings.length !== 0) {
      const allAccounts = keyrings.map((item) => item.accounts).flat();
      const sameAddressList = contacts.filter((item) => allAccounts.find((contact) => contact.pubkey == item.address));
      if (sameAddressList.length > 0) {
        sameAddressList.forEach((item) => this.updateAlianName(item.address, item.name));
      }
    }
  };

  isReady = () => {
    if (contactBookService.store) {
      return true;
    } else {
      return false;
    }
  };

  unlock = async (password: string) => {
    const alianNameInited = preferenceService.getInitAlianNameStatus();
    const alianNames = contactBookService.listAlias();
    await keyringService.submitPassword(password);
    sessionService.broadcastEvent('unlock');
    if (!alianNameInited && alianNames.length === 0) {
      this.initAlianNames();
    }
  };
  isUnlocked = () => {
    return keyringService.memStore.getState().isUnlocked;
  };

  lockWallet = async () => {
    await keyringService.setLocked();
    sessionService.broadcastEvent('accountsChanged', []);
    sessionService.broadcastEvent('lock');
  };

  setPopupOpen = (isOpen: boolean) => {
    preferenceService.setPopupOpen(isOpen);
  };

  getAddressBalance = async (address: string) => {
    const data = await openapiService.getAddressBalance(address);
    preferenceService.updateAddressBalance(address, data);
    return data;
  };

  getMultiAddressAssets = async (addresses: string) => {
    return openapiService.getMultiAddressAssets(addresses);
  };

  findGroupAssets = (groups: { type: number; address_arr: string[] }[]) => {
    return openapiService.findGroupAssets(groups);
  };

  getAddressCacheBalance = (address: string | undefined): BitcoinBalance => {
    const defaultBalance: BitcoinBalance = {
      confirm_amount: '0',
      pending_amount: '0',
      amount: '0',
      usd_value: '0',
      confirm_btc_amount: '0',
      pending_btc_amount: '0',
      btc_amount: '0',
      confirm_inscription_amount: '0',
      pending_inscription_amount: '0',
      inscription_amount: '0'
    };
    if (!address) return defaultBalance;
    return preferenceService.getAddressBalance(address) || defaultBalance;
  };

  getAddressHistory = async (address: string) => {
    const data = await openapiService.getAddressRecentHistory(address);
    preferenceService.updateAddressHistory(address, data);
    return data;
  };

  getAddressInscriptions = async (address: string, cursor: number, size: number) => {
    const data = await openapiService.getAddressInscriptions(address, cursor, size);
    return data;
  };

  getAddressCacheHistory = (address: string | undefined) => {
    if (!address) return [];
    return preferenceService.getAddressHistory(address);
  };

  getExternalLinkAck = () => {
    preferenceService.getExternalLinkAck();
  };

  setExternalLinkAck = (ack) => {
    preferenceService.setExternalLinkAck(ack);
  };

  getLocale = () => {
    return preferenceService.getLocale();
  };

  setLocale = (locale: string) => {
    preferenceService.setLocale(locale);
  };

  getCurrency = () => {
    return preferenceService.getCurrency();
  };

  setCurrency = (currency: string) => {
    preferenceService.setCurrency(currency);
  };

  /* keyrings */

  clearKeyrings = () => keyringService.clearKeyrings();

  getPrivateKey = async (password: string, { pubkey, type }: { pubkey: string; type: string }) => {
    await this.verifyPassword(password);
    const keyring = await keyringService.getKeyringForAccount(pubkey, type);
    if (!keyring) return null;
    const privateKey = await keyring.exportAccount(pubkey);
    const networkType = this.getNetworkType();
    const network = toPsbtNetwork(networkType);
    const hex = privateKey;
    const wif = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'), { network }).toWIF();
    return {
      hex,
      wif
    };
  };

  getMnemonics = async (password: string, keyring: WalletKeyring) => {
    await this.verifyPassword(password);
    const originKeyring = keyringService.keyrings[keyring.index];
    const serialized = await originKeyring.serialize();
    return {
      mnemonic: serialized.mnemonic,
      hdPath: serialized.hdPath,
      passphrase: serialized.passphrase
    };
  };

  createKeyringWithPrivateKey = async (data: string, addressType: AddressType, alianName?: string) => {
    const error = new Error(i18n.t('The private key is invalid'));

    let originKeyring: Keyring;
    try {
      originKeyring = await keyringService.importPrivateKey(data, addressType);
    } catch (e) {
      console.log(e);
      throw e;
    }
    const pubkeys = await originKeyring.getAccounts();
    if (alianName) this.updateAlianName(pubkeys[0], alianName);

    const displayedKeyring = await keyringService.displayForKeyring(
      originKeyring,
      addressType,
      keyringService.keyrings.length - 1
    );
    const keyring = this.displayedKeyringToWalletKeyring(displayedKeyring, keyringService.keyrings.length - 1);
    this.changeKeyring(keyring);
  };

  getPreMnemonics = () => keyringService.getPreMnemonics();
  generatePreMnemonic = () => keyringService.generatePreMnemonic();
  removePreMnemonics = () => keyringService.removePreMnemonics();
  createKeyringWithMnemonics = async (
    mnemonic: string,
    hdPath: string,
    passphrase: string,
    addressType: AddressType,
    accountCount: number
  ) => {
    const originKeyring = await keyringService.createKeyringWithMnemonics(
      mnemonic,
      hdPath,
      passphrase,
      addressType,
      accountCount
    );
    keyringService.removePreMnemonics();

    const displayedKeyring = await keyringService.displayForKeyring(
      originKeyring,
      addressType,
      keyringService.keyrings.length - 1
    );
    const keyring = this.displayedKeyringToWalletKeyring(displayedKeyring, keyringService.keyrings.length - 1);
    this.changeKeyring(keyring);
  };

  createTmpKeyringWithMnemonics = async (
    mnemonic: string,
    hdPath: string,
    passphrase: string,
    addressType: AddressType,
    accountCount = 1
  ) => {
    const activeIndexes: number[] = [];
    for (let i = 0; i < accountCount; i++) {
      activeIndexes.push(i);
    }
    const originKeyring = keyringService.createTmpKeyring('HD Key Tree', {
      mnemonic,
      activeIndexes,
      hdPath,
      passphrase
    });
    const displayedKeyring = await keyringService.displayForKeyring(originKeyring, addressType, -1);
    return this.displayedKeyringToWalletKeyring(displayedKeyring, -1, false);
  };

  createTmpKeyringWithPrivateKey = async (privateKey: string, addressType: AddressType) => {
    const originKeyring = keyringService.createTmpKeyring(KEYRING_TYPE.SimpleKeyring, [privateKey]);
    const displayedKeyring = await keyringService.displayForKeyring(originKeyring, addressType, -1);
    return this.displayedKeyringToWalletKeyring(displayedKeyring, -1, false);
  };

  removeKeyring = async (keyring: WalletKeyring) => {
    await keyringService.removeKeyring(keyring.index);
    const keyrings = await this.getKeyrings();
    const nextKeyring = keyrings[keyrings.length - 1];
    if (nextKeyring) this.changeKeyring(nextKeyring);
    return nextKeyring;
  };

  getKeyringByType = (type: string) => {
    return keyringService.getKeyringByType(type);
  };

  deriveNewAccountFromMnemonic = async (keyring: WalletKeyring, alianName?: string) => {
    const _keyring = keyringService.keyrings[keyring.index];
    const result = await keyringService.addNewAccount(_keyring);
    if (alianName) this.updateAlianName(result[0], alianName);

    const currentKeyring = await this.getCurrentKeyring();
    if (!currentKeyring) throw new Error('no current keyring');
    keyring = currentKeyring;
    this.changeKeyring(keyring, keyring.accounts.length - 1);
  };

  getAccountsCount = async () => {
    const accounts = await keyringService.getAccounts();
    return accounts.filter((x) => x).length;
  };

  changeKeyring = (keyring: WalletKeyring, accountIndex = 0) => {
    preferenceService.setCurrentKeyringIndex(keyring.index);
    preferenceService.setCurrentAccount(keyring.accounts[accountIndex]);
    openapiService.setClientAddress(keyring.accounts[accountIndex].address);
  };

  getAllAddresses = (keyring: WalletKeyring, index: number) => {
    const networkType = this.getNetworkType();
    const addresses: string[] = [];
    const _keyring = keyringService.keyrings[keyring.index];
    if (keyring.type === KEYRING_TYPE.HdKeyring) {
      const pathPubkey: { [path: string]: string } = {};
      ADDRESS_TYPES.filter((v) => v.displayIndex >= 0).forEach((v) => {
        let pubkey = pathPubkey[v.hdPath];
        if (!pubkey && _keyring.getAccountByHdPath) {
          pubkey = _keyring.getAccountByHdPath(v.hdPath, index);
        }
        const address = publicKeyToAddress(pubkey, v.value, networkType);
        addresses.push(address);
      });
    } else {
      ADDRESS_TYPES.filter((v) => v.displayIndex >= 0 && v.isUnisatLegacy === false).forEach((v) => {
        const pubkey = keyring.accounts[index].pubkey;
        const address = publicKeyToAddress(pubkey, v.value, networkType);
        addresses.push(address);
      });
    }
    return addresses;
  };

  changeAddressType = async (addressType: AddressType) => {
    const currentAccount = await this.getCurrentAccount();
    const currentKeyringIndex = preferenceService.getCurrentKeyringIndex();
    await keyringService.changeAddressType(currentKeyringIndex, addressType);
    const keyring = await this.getCurrentKeyring();
    if (!keyring) throw new Error('no current keyring');
    this.changeKeyring(keyring, currentAccount?.index);
  };

  signTransaction = async (type: string, from: string, psbt: bitcoin.Psbt, inputs: ToSignInput[]) => {
    const keyring = await keyringService.getKeyringForAccount(from, type);
    return keyringService.signTransaction(keyring, psbt, inputs);
  };

  formatOptionsToSignInputs = async (_psbt: string | bitcoin.Psbt, options?: SignPsbtOptions) => {
    const account = await this.getCurrentAccount();
    if (!account) throw null;

    let toSignInputs: ToSignInput[] = [];
    if (options && options.toSignInputs) {
      // We expect userToSignInputs objects to be similar to ToSignInput interface,
      // but we allow address to be specified in addition to publicKey for convenience.
      toSignInputs = options.toSignInputs.map((input) => {
        const index = Number(input.index);
        if (isNaN(index)) throw new Error('invalid index in toSignInput');

        if (!(input as AddressUserToSignInput).address && !(input as PublicKeyUserToSignInput).publicKey) {
          throw new Error('no address or public key in toSignInput');
        }

        if ((input as AddressUserToSignInput).address && (input as AddressUserToSignInput).address != account.address) {
          throw new Error('invalid address in toSignInput');
        }

        if (
          (input as PublicKeyUserToSignInput).publicKey &&
          (input as PublicKeyUserToSignInput).publicKey != account.pubkey
        ) {
          throw new Error('invalid public key in toSignInput');
        }

        const sighashTypes = input.sighashTypes?.map(Number);
        if (sighashTypes?.some(isNaN)) throw new Error('invalid sighash type in toSignInput');

        return {
          index,
          publicKey: account.pubkey,
          sighashTypes
        };
      });
    } else {
      const networkType = this.getNetworkType();
      const psbtNetwork = toPsbtNetwork(networkType);

      const psbt =
        typeof _psbt === 'string'
          ? bitcoin.Psbt.fromHex(_psbt as string, { network: psbtNetwork })
          : (_psbt as bitcoin.Psbt);
      psbt.data.inputs.forEach((v, index) => {
        let script: any = null;
        let value = 0;
        if (v.witnessUtxo) {
          script = v.witnessUtxo.script;
          value = v.witnessUtxo.value;
        } else if (v.nonWitnessUtxo) {
          const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo);
          const output = tx.outs[psbt.txInputs[index].index];
          script = output.script;
          value = output.value;
        }
        const isSigned = v.finalScriptSig || v.finalScriptWitness;
        if (script && !isSigned) {
          const address = PsbtAddress.fromOutputScript(script, psbtNetwork);
          if (account.address === address) {
            toSignInputs.push({
              index,
              publicKey: account.pubkey,
              sighashTypes: v.sighashType ? [v.sighashType] : undefined
            });
          }
        }
      });
    }
    return toSignInputs;
  };

  signPsbt = async (psbt: bitcoin.Psbt, toSignInputs: ToSignInput[], autoFinalized: boolean) => {
    const account = await this.getCurrentAccount();
    if (!account) throw new Error('no current account');
    const keyring = await this.getCurrentKeyring();
    if (!keyring) throw new Error('no current keyring');
    const _keyring = keyringService.keyrings[keyring.index];

    const networkType = this.getNetworkType();
    const psbtNetwork = toPsbtNetwork(networkType);

    if (!toSignInputs) {
      // Compatibility with legacy code.
      toSignInputs = await this.formatOptionsToSignInputs(psbt);
      if (autoFinalized !== false) autoFinalized = true;
    }

    psbt.data.inputs.forEach((v, index) => {
      const isNotSigned = !(v.finalScriptSig || v.finalScriptWitness);
      const isP2TR = keyring.addressType === AddressType.P2TR || keyring.addressType === AddressType.M44_P2TR;
      const lostInternalPubkey = !v.tapInternalKey;
      // Special measures taken for compatibility with certain applications.
      if (isNotSigned && isP2TR && lostInternalPubkey) {
        const tapInternalKey = toXOnly(Buffer.from(account.pubkey, 'hex'));
        const { output } = bitcoin.payments.p2tr({
          internalPubkey: tapInternalKey,
          network: psbtNetwork
        });
        if (v.witnessUtxo?.script.toString('hex') == output?.toString('hex')) {
          v.tapInternalKey = tapInternalKey;
        }
      }

      if (keyring.addressType === AddressType.P2PKH) {
        //@ts-ignore
        psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = true;
      }
    });

    psbt = await keyringService.signTransaction(_keyring, psbt, toSignInputs);
    if (autoFinalized) {
      toSignInputs.forEach((v) => {
        // psbt.validateSignaturesOfInput(v.index, validator);
        psbt.finalizeInput(v.index);
      });
    }
    return psbt;
  };

  signPsbtReturnHex = async (psbtHex: string, options?: SignPsbtOptions) => {
    const networkType = this.getNetworkType();
    const psbtNetwork = toPsbtNetwork(networkType);
    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: psbtNetwork });
    const autoFinalized = options && options.autoFinalized == false ? false : true;
    const toSignInputs = await this.formatOptionsToSignInputs(psbtHex, options);
    const psbtObject = await this.signPsbt(psbt, toSignInputs, autoFinalized);
    // @ts-ignore
    psbtObject.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
    return psbtObject.toHex();
  };

  calculateFee = async (psbtHex: string, feeRate: number, options?: SignPsbtOptions): Promise<number> => {
    const networkType = this.getNetworkType();
    const psbtNetwork = toPsbtNetwork(networkType);
    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: psbtNetwork });
    const autoFinalized = options && options.autoFinalized == false ? false : true;
    const toSignInputs = await this.formatOptionsToSignInputs(psbtHex, options);
    const psbtObject = await this.signPsbt(psbt, toSignInputs, autoFinalized);
    let txSize = psbtObject.extractTransaction(true).toBuffer().length;
    psbt.data.inputs.forEach((v) => {
      if (v.finalScriptWitness) {
        txSize -= v.finalScriptWitness.length * 0.75;
      }
    });
    const fee = Math.ceil(txSize * feeRate);
    return fee;
  };

  signMessage = async (text: string) => {
    const account = preferenceService.getCurrentAccount();
    if (!account) throw new Error('no current account');
    return keyringService.signMessage(account.pubkey, text);
  };

  signBIP322Simple = async (text: string) => {
    const account = preferenceService.getCurrentAccount();
    if (!account) throw new Error('no current account');
    const networkType = this.getNetworkType();
    const psbtNetwork = toPsbtNetwork(networkType);
    return signBip322MessageSimple({
      message: text,
      address: account.address,
      network: psbtNetwork,
      wallet: this
    });
  };

  requestKeyring = (type: string, methodName: string, keyringId: number | null, ...params) => {
    let keyring;
    if (keyringId !== null && keyringId !== undefined) {
      keyring = stashKeyrings[keyringId];
    } else {
      try {
        keyring = this._getKeyringByType(type);
      } catch {
        const Keyring = keyringService.getKeyringClassForType(type);
        keyring = new Keyring();
      }
    }
    if (keyring[methodName]) {
      return keyring[methodName].call(keyring, ...params);
    }
  };

  getTransactionHistory = async (address: string) => {
    const result = await openapiService.getAddressRecentHistory(address);
    return result;
  };

  private _getKeyringByType = (type: string): Keyring => {
    const keyring = keyringService.getKeyringsByType(type)[0];

    if (keyring) {
      return keyring;
    }

    throw new Error(`No ${type} keyring found`);
  };

  addContact = (data: ContactBookItem) => {
    contactBookService.addContact(data);
  };

  updateContact = (data: ContactBookItem) => {
    contactBookService.updateContact(data);
  };

  removeContact = (address: string) => {
    contactBookService.removeContact(address);
  };

  listContact = (includeAlias = true) => {
    const list = contactBookService.listContacts();
    if (includeAlias) {
      return list;
    } else {
      return list.filter((item) => !item.isAlias);
    }
  };

  getContactsByMap = () => {
    return contactBookService.getContactsByMap();
  };

  getContactByAddress = (address: string) => {
    return contactBookService.getContactByAddress(address);
  };

  private _generateAlianName = (type: string, index: number) => {
    const alianName = `${BRAND_ALIAN_TYPE_TEXT[type]} ${index}`;
    return alianName;
  };

  getNextAlianName = (keyring: WalletKeyring) => {
    return this._generateAlianName(keyring.type, keyring.accounts.length + 1);
  };

  getHighlightWalletList = () => {
    return preferenceService.getWalletSavedList();
  };

  updateHighlightWalletList = (list) => {
    return preferenceService.updateWalletSavedList(list);
  };

  getAlianName = (pubkey: string) => {
    const contactName = contactBookService.getContactByAddress(pubkey)?.name;
    return contactName;
  };

  updateAlianName = (pubkey: string, name: string) => {
    contactBookService.updateAlias({
      name,
      address: pubkey
    });
  };

  getAllAlianName = () => {
    return contactBookService.listAlias();
  };

  getInitAlianNameStatus = () => {
    return preferenceService.getInitAlianNameStatus();
  };

  updateInitAlianNameStatus = () => {
    preferenceService.changeInitAlianNameStatus();
  };

  getIsFirstOpen = () => {
    return preferenceService.getIsFirstOpen();
  };

  updateIsFirstOpen = () => {
    return preferenceService.updateIsFirstOpen();
  };

  listChainAssets = async (pubkeyAddress: string) => {
    const balance = await openapiService.getAddressBalance(pubkeyAddress);
    const assets: AccountAsset[] = [
      { name: COIN_NAME, symbol: COIN_SYMBOL, amount: balance.amount, value: balance.usd_value }
    ];
    return assets;
  };

  reportErrors = (error: string) => {
    console.error('report not implemented');
  };

  getNetworkType = () => {
    const networkType = preferenceService.getNetworkType();
    return networkType;
  };

  setNetworkType = async (networkType: NetworkType) => {
    preferenceService.setNetworkType(networkType);
    if (networkType === NetworkType.MAINNET) {
      this.openapi.setHost(OPENAPI_URL_MAINNET);
    } else {
      this.openapi.setHost(OPENAPI_URL_TESTNET);
    }
    const network = this.getNetworkName();
    sessionService.broadcastEvent('networkChanged', {
      network
    });

    const currentAccount = await this.getCurrentAccount();
    const keyring = await this.getCurrentKeyring();
    if (!keyring) throw new Error('no current keyring');
    this.changeKeyring(keyring, currentAccount?.index);

    const atomicalEndPoint =
      networkType === NetworkType.MAINNET ? AtomNetworkType.ATOMICALS : AtomNetworkType.ATOMICALS_TEST;
    this.setAtomicalEndPoint(atomicalEndPoint);
  };

  getNetworkName = () => {
    const networkType = preferenceService.getNetworkType();
    return NETWORK_TYPES[networkType].name;
  };

  getAtomicalEndPoint = () => {
    const endPointHost = preferenceService.getAtomicalEndPoint();
    return endPointHost;
  };

  setAtomicalEndPoint = (host: string) => {
    preferenceService.setAtomicalEndPoint(host);
  };

  // sendBTC = async ({
  //   to,
  //   amount,
  //   utxos,
  //   receiverToPayFee,
  //   feeRate
  // }: {
  //   to: string;
  //   amount: number;
  //   utxos: UTXO[];
  //   receiverToPayFee: boolean;
  //   feeRate: number;
  // }) => {
  //   const account = preferenceService.getCurrentAccount();
  //   if (!account) throw new Error('no current account');

  //   const networkType = this.getNetworkType();
  //   const psbtNetwork = toPsbtNetwork(networkType);

  //   const psbt = await createSendBTC({
  //     utxos: utxos.map((v) => {
  //       return {
  //         txId: v.txId,
  //         outputIndex: v.outputIndex,
  //         satoshis: v.satoshis,
  //         scriptPk: v.scriptPk,
  //         addressType: v.addressType,
  //         address: account.address,
  //         ords: v.inscriptions
  //       };
  //     }),
  //     toAddress: to,
  //     toAmount: amount,
  //     wallet: this,
  //     network: psbtNetwork,
  //     changeAddress: account.address,
  //     receiverToPayFee,
  //     pubkey: account.pubkey,
  //     feeRate,
  //     enableRBF: false
  //   });

  //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //   //@ts-ignore
  //   psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
  //   return psbt.toHex();
  // };

  // sendInscription = async ({
  //   to,
  //   inscriptionId,
  //   feeRate,
  //   outputValue
  // }: {
  //   to: string;
  //   inscriptionId: string;
  //   feeRate: number;
  //   outputValue: number;
  // }) => {
  //   const account = await preferenceService.getCurrentAccount();
  //   if (!account) throw new Error('no current account');

  //   const networkType = preferenceService.getNetworkType();
  //   const psbtNetwork = toPsbtNetwork(networkType);

  //   const utxo = await openapiService.getInscriptionUtxo(inscriptionId);
  //   if (!utxo) {
  //     throw new Error('UTXO not found.');
  //   }

  //   if (utxo.inscriptions.length > 1) {
  //     throw new Error('Multiple inscriptions are mixed together. Please split them first.');
  //   }

  //   const btc_utxos = await openapiService.getAddressUtxo(account.address);
  //   const utxos = [utxo].concat(btc_utxos);

  //   const psbt = await createSendOrd({
  //     utxos: utxos.map((v) => {
  //       return {
  //         txId: v.txId,
  //         outputIndex: v.outputIndex,
  //         satoshis: v.satoshis,
  //         scriptPk: v.scriptPk,
  //         addressType: v.addressType,
  //         address: account.address,
  //         ords: v.inscriptions
  //       };
  //     }),
  //     toAddress: to,
  //     toOrdId: inscriptionId,
  //     wallet: this,
  //     network: psbtNetwork,
  //     changeAddress: account.address,
  //     pubkey: account.pubkey,
  //     feeRate,
  //     outputValue,
  //     enableRBF: false
  //   });
  //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //   //@ts-ignore
  //   psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
  //   return psbt.toHex();
  // };

  // sendInscriptions = async ({
  //   to,
  //   inscriptionIds,
  //   feeRate
  // }: {
  //   to: string;
  //   inscriptionIds: string[];
  //   utxos: UTXO[];
  //   feeRate: number;
  // }) => {
  //   const account = await preferenceService.getCurrentAccount();
  //   if (!account) throw new Error('no current account');

  //   const networkType = preferenceService.getNetworkType();
  //   const psbtNetwork = toPsbtNetwork(networkType);

  //   const inscription_utxos = await openapiService.getInscriptionUtxos(inscriptionIds);
  //   if (!inscription_utxos) {
  //     throw new Error('UTXO not found.');
  //   }

  //   if (inscription_utxos.find((v) => v.inscriptions.length > 1)) {
  //     throw new Error('Multiple inscriptions are mixed together. Please split them first.');
  //   }

  //   const btc_utxos = await openapiService.getAddressUtxo(account.address);
  //   const utxos = inscription_utxos.concat(btc_utxos);

  //   const psbt = await createSendMultiOrds({
  //     utxos: utxos.map((v) => {
  //       return {
  //         txId: v.txId,
  //         outputIndex: v.outputIndex,
  //         satoshis: v.satoshis,
  //         scriptPk: v.scriptPk,
  //         addressType: v.addressType,
  //         address: account.address,
  //         ords: v.inscriptions
  //       };
  //     }),
  //     toAddress: to,
  //     toOrdIds: inscriptionIds,
  //     wallet: this,
  //     network: psbtNetwork,
  //     changeAddress: account.address,
  //     pubkey: account.pubkey,
  //     feeRate,
  //     enableRBF: false
  //   });
  //   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  //   //@ts-ignore
  //   psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
  //   return psbt.toHex();
  // };

  splitInscription = async ({
    inscriptionId,
    feeRate,
    outputValue
  }: {
    to: string;
    inscriptionId: string;
    feeRate: number;
    outputValue: number;
  }) => {
    const account = await preferenceService.getCurrentAccount();
    if (!account) throw new Error('no current account');

    const networkType = preferenceService.getNetworkType();
    const psbtNetwork = toPsbtNetwork(networkType);

    const utxo = await openapiService.getInscriptionUtxo(inscriptionId);
    if (!utxo) {
      throw new Error('UTXO not found.');
    }

    const btc_utxos = await openapiService.getAddressUtxo(account.address);
    const utxos = [utxo].concat(btc_utxos);

    const { psbt, splitedCount } = await createSplitOrdUtxoV2({
      utxos: utxos.map((v) => {
        return {
          txId: v.txId,
          outputIndex: v.outputIndex,
          satoshis: v.satoshis,
          scriptPk: v.scriptPk,
          addressType: v.addressType,
          address: account.address,
          ords: v.inscriptions
        };
      }),
      wallet: this,
      network: psbtNetwork,
      changeAddress: account.address,
      pubkey: account.pubkey,
      feeRate,
      enableRBF: false,
      outputValue
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
    return {
      psbtHex: psbt.toHex(),
      splitedCount
    };
  };

  pushTx = async (rawtx: string) => {
    const txid = await this.openapi.pushTx(rawtx);
    return txid;
  };

  getAccounts = async () => {
    const keyrings = await this.getKeyrings();
    const accounts: Account[] = keyrings.reduce<Account[]>((pre, cur) => pre.concat(cur.accounts), []);
    return accounts;
  };

  displayedKeyringToWalletKeyring = (displayedKeyring: DisplayedKeyring, index: number, initName = true) => {
    const networkType = preferenceService.getNetworkType();
    const addressType = displayedKeyring.addressType;
    const key = 'keyring_' + index;
    const type = displayedKeyring.type;
    const accounts: Account[] = [];
    for (let j = 0; j < displayedKeyring.accounts.length; j++) {
      const { pubkey } = displayedKeyring.accounts[j];
      const address = publicKeyToAddress(pubkey, addressType, networkType);
      const accountKey = key + '#' + j;
      const defaultName = this.getAlianName(pubkey) || this._generateAlianName(type, j + 1);
      const alianName = preferenceService.getAccountAlianName(accountKey, defaultName);
      accounts.push({
        type,
        pubkey,
        address,
        alianName,
        index: j,
        key: accountKey
      });
    }
    const hdPath = type === KEYRING_TYPE.HdKeyring ? displayedKeyring.keyring.hdPath : '';
    const alianName = preferenceService.getKeyringAlianName(
      key,
      initName ? `${KEYRING_TYPES[type].alianName} #${index + 1}` : ''
    );
    const keyring: WalletKeyring = {
      index,
      key,
      type,
      addressType,
      accounts,
      alianName,
      hdPath
    };
    return keyring;
  };

  getKeyrings = async (): Promise<WalletKeyring[]> => {
    const displayedKeyrings = await keyringService.getAllDisplayedKeyrings();
    const keyrings: WalletKeyring[] = [];
    for (let index = 0; index < displayedKeyrings.length; index++) {
      const displayedKeyring = displayedKeyrings[index];
      if (displayedKeyring.type !== KEYRING_TYPE.Empty) {
        const keyring = this.displayedKeyringToWalletKeyring(displayedKeyring, displayedKeyring.index);
        keyrings.push(keyring);
      }
    }

    return keyrings;
  };

  getCurrentKeyring = async () => {
    let currentKeyringIndex = preferenceService.getCurrentKeyringIndex();
    const displayedKeyrings = await keyringService.getAllDisplayedKeyrings();
    if (currentKeyringIndex === undefined) {
      const currentAccount = preferenceService.getCurrentAccount();
      for (let i = 0; i < displayedKeyrings.length; i++) {
        if (displayedKeyrings[i].type !== currentAccount?.type) {
          continue;
        }
        const found = displayedKeyrings[i].accounts.find((v) => v.pubkey === currentAccount?.pubkey);
        if (found) {
          currentKeyringIndex = i;
          break;
        }
      }
      if (currentKeyringIndex === undefined) {
        currentKeyringIndex = 0;
      }
    }

    if (!displayedKeyrings[currentKeyringIndex] || displayedKeyrings[currentKeyringIndex].type === KEYRING_TYPE.Empty) {
      for (let i = 0; i < displayedKeyrings.length; i++) {
        if (displayedKeyrings[i].type !== KEYRING_TYPE.Empty) {
          currentKeyringIndex = i;
          preferenceService.setCurrentKeyringIndex(currentKeyringIndex);
          break;
        }
      }
    }
    const displayedKeyring = displayedKeyrings[currentKeyringIndex];
    if (!displayedKeyring) return null;
    return this.displayedKeyringToWalletKeyring(displayedKeyring, currentKeyringIndex);
  };

  getCurrentAccount = async () => {
    const currentKeyring = await this.getCurrentKeyring();
    if (!currentKeyring) return null;
    const account = preferenceService.getCurrentAccount();
    let currentAccount: Account | undefined = undefined;
    currentKeyring.accounts.forEach((v) => {
      if (v.pubkey === account?.pubkey) {
        currentAccount = v;
      }
    });
    if (!currentAccount) {
      currentAccount = currentKeyring.accounts[0];
    }
    if (currentAccount) {
      openapiService.setClientAddress(currentAccount.address);
    }
    return currentAccount;
  };

  getEditingKeyring = async () => {
    const editingKeyringIndex = preferenceService.getEditingKeyringIndex();
    const displayedKeyrings = await keyringService.getAllDisplayedKeyrings();
    const displayedKeyring = displayedKeyrings[editingKeyringIndex];
    return this.displayedKeyringToWalletKeyring(displayedKeyring, editingKeyringIndex);
  };

  setEditingKeyring = async (index: number) => {
    preferenceService.setEditingKeyringIndex(index);
  };

  getEditingAccount = async () => {
    const account = preferenceService.getEditingAccount();
    return account;
  };

  setEditingAccount = async (account: Account) => {
    preferenceService.setEditingAccount(account);
  };

  queryDomainInfo = async (domain: string) => {
    const data = await openapiService.getDomainInfo(domain);
    return data;
  };

  getInscriptionSummary = async () => {
    const data = await openapiService.getInscriptionSummary();
    return data;
  };

  getAppSummary = async () => {
    const appTab = preferenceService.getAppTab();
    try {
      const data = await openapiService.getAppSummary();
      const readTabTime = appTab.readTabTime;
      data.apps.forEach((w) => {
        const readAppTime = appTab.readAppTime[w.id];
        if (w.time) {
          if (Date.now() > w.time + 1000 * 60 * 60 * 24 * 7) {
            w.new = false;
          } else if (readAppTime && readAppTime > w.time) {
            w.new = false;
          } else {
            w.new = true;
          }
        } else {
          w.new = false;
        }
      });
      data.readTabTime = readTabTime;
      preferenceService.setAppSummary(data);
      return data;
    } catch (e) {
      console.log('getAppSummary error:', e);
      return appTab.summary;
    }
  };

  readTab = async () => {
    return preferenceService.setReadTabTime(Date.now());
  };

  readApp = async (appid: number) => {
    return preferenceService.setReadAppTime(appid, Date.now());
  };

  getAddressUtxo = async (address: string) => {
    const data = await openapiService.getAddressUtxo(address);
    return data;
  };

  getConnectedSite = permissionService.getConnectedSite;
  getSite = permissionService.getSite;
  getConnectedSites = permissionService.getConnectedSites;
  setRecentConnectedSites = (sites: ConnectedSite[]) => {
    permissionService.setRecentConnectedSites(sites);
  };
  getRecentConnectedSites = () => {
    return permissionService.getRecentConnectedSites();
  };
  getCurrentSite = (tabId: number): ConnectedSite | null => {
    const { origin, name, icon } = sessionService.getSession(tabId) || {};
    if (!origin) {
      return null;
    }
    const site = permissionService.getSite(origin);
    if (site) {
      return site;
    }
    return {
      origin,
      name,
      icon,
      chain: CHAINS_ENUM.BTC,
      isConnected: false,
      isSigned: false,
      isTop: false
    };
  };
  getCurrentConnectedSite = (tabId: number) => {
    const { origin } = sessionService.getSession(tabId) || {};
    return permissionService.getWithoutUpdate(origin);
  };
  setSite = (data: ConnectedSite) => {
    permissionService.setSite(data);
    if (data.isConnected) {
      const network = this.getNetworkName();
      sessionService.broadcastEvent(
        'networkChanged',
        {
          network
        },
        data.origin
      );
    }
  };
  updateConnectSite = (origin: string, data: ConnectedSite) => {
    permissionService.updateConnectSite(origin, data);
    const network = this.getNetworkName();
    sessionService.broadcastEvent(
      'networkChanged',
      {
        network
      },
      data.origin
    );
  };
  removeAllRecentConnectedSites = () => {
    const sites = permissionService.getRecentConnectedSites().filter((item) => !item.isTop);
    sites.forEach((item) => {
      this.removeConnectedSite(item.origin);
    });
  };
  removeConnectedSite = (origin: string) => {
    sessionService.broadcastEvent('accountsChanged', [], origin);
    permissionService.removeConnectedSite(origin);
  };

  setKeyringAlianName = (keyring: WalletKeyring, name: string) => {
    preferenceService.setKeyringAlianName(keyring.key, name);
    keyring.alianName = name;
    return keyring;
  };

  setAccountAlianName = (account: Account, name: string) => {
    preferenceService.setAccountAlianName(account.key, name);
    account.alianName = name;
    return account;
  };

  getFeeSummary = async () => {
    const result = await openapiService.getFeeSummary();
    return result;
  };

  inscribeBRC20Transfer = (address: string, tick: string, amount: string, feeRate: number) => {
    return openapiService.inscribeBRC20Transfer(address, tick, amount, feeRate);
  };

  getInscribeResult = (orderId: string) => {
    return openapiService.getInscribeResult(orderId);
  };

  decodePsbt = (psbtHex: string) => {
    return openapiService.decodePsbt(psbtHex);
  };

  getBRC20List = async (address: string, currentPage: number, pageSize: number) => {
    const cursor = (currentPage - 1) * pageSize;
    const size = pageSize;

    const uiCachedData = preferenceService.getUICachedData(address);
    if (uiCachedData.brc20List[currentPage]) {
      return uiCachedData.brc20List[currentPage];
    }

    const { total, list } = await openapiService.getAddressTokenBalances(address, cursor, size);
    uiCachedData.brc20List[currentPage] = {
      currentPage,
      pageSize,
      total,
      list
    };
    return {
      currentPage,
      pageSize,
      total,
      list
    };
  };

  getAllInscriptionList = async (address: string, currentPage: number, pageSize: number) => {
    const cursor = (currentPage - 1) * pageSize;
    const size = pageSize;

    const uiCachedData = preferenceService.getUICachedData(address);
    if (uiCachedData.allInscriptionList[currentPage]) {
      return uiCachedData.allInscriptionList[currentPage];
    }

    const { total, list } = await openapiService.getAddressInscriptions(address, cursor, size);
    uiCachedData.allInscriptionList[currentPage] = {
      currentPage,
      pageSize,
      total,
      list
    };
    return {
      currentPage,
      pageSize,
      total,
      list
    };
  };

  getBRC20Summary = async (address: string, ticker: string) => {
    const uiCachedData = preferenceService.getUICachedData(address);
    if (uiCachedData.brc20Summary[ticker]) {
      return uiCachedData.brc20Summary[ticker];
    }

    const tokenSummary = await openapiService.getAddressTokenSummary(address, ticker);
    uiCachedData.brc20Summary[ticker] = tokenSummary;
    return tokenSummary;
  };

  getBRC20TransferableList = async (address: string, ticker: string, currentPage: number, pageSize: number) => {
    const cursor = (currentPage - 1) * pageSize;
    const size = pageSize;

    const uiCachedData = preferenceService.getUICachedData(address);
    if (uiCachedData.brc20TransferableList[ticker] && uiCachedData.brc20TransferableList[ticker][currentPage]) {
      return uiCachedData.brc20TransferableList[ticker][currentPage];
    }
    if (!uiCachedData.brc20TransferableList[ticker]) {
      uiCachedData.brc20TransferableList[ticker] = [];
    }

    const { total, list } = await openapiService.getTokenTransferableList(address, ticker, cursor, size);
    uiCachedData.brc20TransferableList[ticker][currentPage] = {
      currentPage,
      pageSize,
      total,
      list
    };
    return {
      currentPage,
      pageSize,
      total,
      list
    };
  };

  validateAtomical = async (rawtx: string) => {
    return this.atomicalApi.electrumApi.validate(rawtx);
  };

  getAtomicals = async (address: string, network: NetworkType): Promise<IWalletBalance> => {
    const host = this.getAtomicalEndPoint();
    console.log('host====', host);
    if (host) {
      let newHost;
      if (network === NetworkType.TESTNET && host.indexOf('test') === -1) {
        newHost = AtomNetworkType.ATOMICALS_TEST;
      } else if (network === NetworkType.MAINNET && host.indexOf('test') > -1) {
        newHost = AtomNetworkType.ATOMICALS;
      } else {
        newHost = host;
      }
      this.changeAtomicalEndpoint(newHost);
    }
    const { scripthash, output } = detectAddressTypeToScripthash(address, network);
    const res = await this.atomicalApi.electrumApi.atomicalsByScripthash(scripthash, true);
    console.log('res', res);
    let cursor = 0;
    const size = 100;
    let hasMore = true;
    const oldOrdinals: any[] = [];
    while (hasMore) {
      const v = await this.getAddressInscriptions(address, cursor, size);
      oldOrdinals.push(...(v?.list || []));
      cursor += size;
      hasMore = oldOrdinals.length < v.total;
    }
    const txs = await (network === NetworkType.MAINNET ? mempoolService : mempoolServiceTest).txsMempool(address);
    const unconfirmedVinSet = new Set(txs!.map((e) => e.vin.map((e) => e.txid + ':' + e.vout)).flat());
    const all = (res.utxos as AtomUtxo[]).sort((a, b) => b.value - a.value);
    const confirmedUTXOs: AtomUtxo[] = [];
    let confirmedValue = 0;
    const atomicalsUTXOs: AtomUtxo[] = [];
    let atomicalsValue = 0;
    const ordinalsUTXOs: AtomUtxo[] = [];
    let ordinalsValue = 0;
    const regularsUTXOs: AtomUtxo[] = [];
    let regularsValue = 0;
    const unconfirmedUTXOs: AtomUtxo[] = [];
    let unconfirmedValue = 0;
    const atomicalsWithOrdinalsUTXOs: AtomUtxo[] = [];
    let atomicalsWithOrdinalsValue = 0;
    const mergedUTXOs: AtomUtxo[] = [];
    for (const utxo of all) {
      if (unconfirmedVinSet.has(utxo.txid + ':' + utxo.vout)) {
        unconfirmedValue += utxo.value;
        unconfirmedUTXOs.push(utxo);
      } else {
        confirmedValue += utxo.value;
        confirmedUTXOs.push(utxo);

        const isAtomical = utxo.atomicals && utxo.atomicals.length;
        if (isAtomical) {
          atomicalsValue += utxo.value;
          atomicalsUTXOs.push(utxo);
          if (utxo.atomicals!.length > 1) {
            mergedUTXOs.push(utxo);
          }
        }

        const find = oldOrdinals.find((item) => {
          const split = item.output.split(':');
          return split[0] === utxo.txid && parseInt(split[1], 10) === utxo.vout;
        });

        if (find) {
          ordinalsUTXOs.push(utxo);
          ordinalsValue += utxo.value;
        }

        if (find && isAtomical) {
          atomicalsWithOrdinalsUTXOs.push(utxo);
          atomicalsWithOrdinalsValue += utxo.value;
        }

        if (!isAtomical && !find) {
          regularsUTXOs.push(utxo);
          regularsValue += utxo.value;
        }
      }
    }
    const atomicalFTs: (IAtomicalItem & { utxos: AtomUtxo[] })[] = [];
    const atomicalNFTs: IAtomicalItem[] = [];
    const atomicalMerged: IMergedAtomicals[] = [];
    for (const key in res.atomicals) {
      const atomical = res.atomicals[key] as any;
      const data = atomical.data;
      const item = {
        ...data,
        value: atomical.confirmed
      };
      const find = mergedUTXOs.find((e) => e.atomicals?.includes(atomical.atomical_id));
      if (find) {
        const v = atomicalMerged.find((e) => e.txid === find!.txid && e.vout === find!.vout);
        if (v) {
          v.atomicals.push(item);
        } else {
          atomicalMerged.push({ ...find, atomicals: [item] });
        }
      } else if (atomical.type === 'FT') {
        const v = atomicalFTs.find((e) => e.$ticker === atomical.ticker);
        const utxos = atomicalsUTXOs.filter((e) => e.atomicals?.includes(atomical.atomical_id))!;
        if (utxos.length) {
          if (v) {
            v.utxos.push(...utxos);
            v.value += utxos.reduce((a, b) => a + b.value, 0);
          } else {
            atomicalFTs.push({
              ...item,
              confirmed: true,
              utxos: utxos,
              value: utxos.reduce((a, b) => a + b.value, 0)
            });
          }
        }
      } else if (atomical.type === 'NFT') {
        atomicalNFTs.push(item);
      }
    }
    const balance: IWalletBalance = {
      address,
      output,
      scripthash,
      atomicalFTs,
      atomicalNFTs,
      atomicalMerged,
      confirmedUTXOs,
      confirmedValue,
      atomicalsUTXOs,
      atomicalsValue,
      ordinalsUTXOs,
      ordinalsValue,
      regularsUTXOs,
      regularsValue,
      unconfirmedUTXOs,
      unconfirmedValue,
      atomicalsWithOrdinalsUTXOs,
      atomicalsWithOrdinalsValue
    };

    return balance;
  };

  expireUICachedData = (address: string) => {
    return preferenceService.expireUICachedData(address);
  };

  createMoonpayUrl = (address: string) => {
    return openapiService.createMoonpayUrl(address);
  };

  getWalletConfig = () => {
    return openapiService.getWalletConfig();
  };

  getSkippedVersion = () => {
    return preferenceService.getSkippedVersion();
  };

  setSkippedVersion = (version: string) => {
    return preferenceService.setSkippedVersion(version);
  };

  getInscriptionUtxoDetail = async (inscriptionId: string) => {
    const utxo = await openapiService.getInscriptionUtxoDetail(inscriptionId);
    if (!utxo) {
      throw new Error('UTXO not found.');
    }
    return utxo;
  };

  checkWebsite = (website: string) => {
    return openapiService.checkWebsite(website);
  };

  getPrice = () => {
    return mempoolService.getPrice();
  };
  getFee = () => {
    return mempoolService.getFee();
  };

  getUtxo = (address: string) => {
    return mempoolService.getUtxo(address);
  };
}

export default new WalletController();
