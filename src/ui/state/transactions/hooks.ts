import { Psbt } from 'bitcoinjs-lib';
import { useCallback, useMemo } from 'react';
import * as bitcoin from 'bitcoinjs-lib';
import { NetworkType, RawTxInfo, ToAddressInfo, TransferFtConfigInterface } from '@/shared/types';
import { useTools } from '@/ui/components/ActionComponent';
import { calcFee, calculateFundsRequired, calculateGasV2, satoshisToBTC, sleep, useWallet } from '@/ui/utils';

import { AppState } from '..';
import { useAccountAddress, useAtomicals, useCurrentAccount } from '../accounts/hooks';
import { accountActions } from '../accounts/reducer';
import { useAppDispatch, useAppSelector } from '../hooks';
import { transactionsActions } from './reducer';
import { detectAddressTypeToScripthash } from '@/background/service/utils';
import { UTXO } from '@/background/service/interfaces/utxo';
import { DUST_AMOUNT } from '@/shared/constant';
import { getAddressType, utxoToInput } from '@/ui/utils/local_wallet';

export function useTransactionsState(): AppState['transactions'] {
  return useAppSelector((state) => state.transactions);
}

export function useBitcoinTx() {
  const transactionsState = useTransactionsState();
  return transactionsState.bitcoinTx;
}

export function useCreateBitcoinTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const fromAddress = useAccountAddress();
  const account = useCurrentAccount();
  // const utxos = useUtxos();
  // const fetchUtxos = useFetchUtxosCallback();
  const atomicals = useAtomicals();

  return useCallback(
    async (toAddressInfo: ToAddressInfo, toAmount: number, feeRate?: number, receiverToPayFee = false) => {
      let regularsUTXOs = atomicals.regularsUTXOs;
      const safeBalance = atomicals.regularsValue;
      if (safeBalance < toAmount) {
        throw new Error('Insufficient balance ');
      }
      try {
        detectAddressTypeToScripthash(toAddressInfo.address);
      } catch (e) {
        return {
          psbtHex: '',
          rawtx: '',
          toAddressInfo,
          err: 'Please ensure all addresses have been entered correctly.'
        };
      }

      if (!feeRate) {
        const summary = await wallet.getFeeSummary();
        feeRate = summary.list[1].feeRate;
      }
      let inputValue = 0;
      let inputUtxos: UTXO[] = [];
      let fee;
      const outputUtxos: { address: string; value: number }[] = [];
      outputUtxos.push({
        address: toAddressInfo.address,
        value: toAmount
      });
      let v = -1;
      for (const utxo of regularsUTXOs) {
        inputValue += utxo.value;
        inputUtxos.push(utxo);
        const remainder = inputValue - toAmount;
        if (remainder >= 0) {
          const newOutputs: { address: string; value: number }[] = [...outputUtxos];
          if (remainder >= DUST_AMOUNT) {
            newOutputs.push({
              address: fromAddress,
              value: remainder
            });
          }
          const retFee = calcFee({
            inputs: inputUtxos,
            outputs: newOutputs,
            feeRate: feeRate,
            addressType: getAddressType(fromAddress)!,
            network: NetworkType.MAINNET
          });
          v = remainder - retFee;
          if (v >= 0) {
            if (v >= DUST_AMOUNT) {
              fee = retFee;
            } else {
              fee = retFee + v;
            }
            break;
          }
        }
      }
      if (v < 0) {
        return {
          psbtHex: '',
          rawtx: '',
          toAddressInfo,
          fee,
          err: 'Insufficient balance.'
        };
      } else if (v >= DUST_AMOUNT) {
        outputUtxos.push({
          address: fromAddress,
          value: v
        });
      }
      const psbt = new Psbt({ network: bitcoin.networks.bitcoin });
      for (const utxo of outputUtxos) {
        psbt.addOutput(utxo);
      }
      const { output } = detectAddressTypeToScripthash(fromAddress);
      for (const utxo of inputUtxos) {
        const utxoInput = utxoToInput({
          utxo,
          pubkey: account.pubkey,
          addressType: getAddressType(fromAddress)!,
          script: output
        });
        if (utxoInput) {
          psbt.addInput(utxoInput.data);
        } else {
          return {
            psbtHex: '',
            rawtx: '',
            toAddressInfo,
            err: 'Invalid fromAddress.'
          };
        }
      }
      const psbtHex = psbt.toHex();
      const s = await wallet.signPsbtReturnHex(psbtHex, { autoFinalized: true });
      const signPsbt = Psbt.fromHex(s);
      const tx = signPsbt.extractTransaction();
      const rawtx = tx.toHex();
      // const psbtHex = await wallet.sendBTC({
      //   to: toAddressInfo.address,
      //   amount: toAmount,
      //   utxos: _utxos,
      //   receiverToPayFee,
      //   feeRate
      // });
      // const psbt = Psbt.fromHex(psbtHex);
      // const rawtx = psbt.extractTransaction().toHex();
      // const fee = psbt.getFee();
      dispatch(
        transactionsActions.updateBitcoinTx({
          rawtx,
          psbtHex,
          fromAddress,
          feeRate: fee
        })
      );
      const rawTxInfo: RawTxInfo = {
        psbtHex,
        rawtx,
        toAddressInfo,
        fee
      };
      return rawTxInfo;
    },
    [dispatch, wallet, fromAddress, atomicals]
  );
}

export function useCreateARC20TxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const account = useCurrentAccount();
  const fromAddress = useAccountAddress();
  const atomicals = useAtomicals();
  return useCallback(
    async (
      transferOptions: TransferFtConfigInterface,
      toAddressInfo: ToAddressInfo,
      // nonAtomUtxos: UTXO[],
      satsbyte: number
    ): Promise<RawTxInfo | undefined> => {
      if (transferOptions.type !== 'FT') {
        throw 'Atomical is not an FT. It is expected to be an FT type';
      }
      // const accounts =
      const pubkey = account.pubkey;
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
      let tokenBalanceIn = 0;
      let tokenBalanceOut = 0;
      for (const utxo of transferOptions.selectedUtxos) {
        // Add the atomical input, the value from the input counts towards the total satoshi amount required
        const utxoInput = utxoToInput({
          utxo,
          addressType: getAddressType(fromAddress),
          pubkey,
          script: atomicals.output
        });
        if (utxoInput) {
          psbt.addInput(utxoInput.data);
        } else {
          return {
            psbtHex: '',
            rawtx: '',
            toAddressInfo,
            err: 'Invalid fromAddress.'
          };
        }
        tokenBalanceIn += utxo.value;
      }

      for (const output of transferOptions.outputs) {
        psbt.addOutput({
          value: output.value,
          address: output.address
        });
        tokenBalanceOut += output.value;
      }
      if (tokenBalanceIn !== tokenBalanceOut) {
        console.log('Invalid input and output does not match for token. Developer Error.');
        return {
          psbtHex: '',
          rawtx: '',
          toAddressInfo,
          err: 'Invalid input and output does not match for token.'
        };
      }

      const expectedSatoshisDeposit = await calculateGasV2(
        fromAddress,
        {
          selectedUtxos: transferOptions.selectedUtxos,
          outputs: transferOptions.outputs,
          regularsUTXOs: atomicals.regularsUTXOs
        },
        satsbyte
      );
      // add nonAtomUtxos least to expected deposit value
      let addedValue = 0;
      const addedInputs: UTXO[] = [];

      for (let i = 0; i < atomicals.regularsUTXOs.length; i++) {
        const utxo = atomicals.regularsUTXOs[i];

        if (addedValue >= expectedSatoshisDeposit) {
          break;
        } else {
          addedValue += utxo.value;
          addedInputs.push(utxo);
          const utxoInput = utxoToInput({
            utxo,
            addressType: getAddressType(fromAddress),
            pubkey,
            script: atomicals.output
          });
          if (utxoInput) {
            psbt.addInput(utxoInput.data);
          } else {
            return {
              psbtHex: '',
              rawtx: '',
              toAddressInfo,
              err: 'Invalid fromAddress.'
            };
          }
        }
      }

      if (addedValue - expectedSatoshisDeposit >= 546) {
        psbt.addOutput({
          value: addedValue - expectedSatoshisDeposit,
          address: fromAddress
        });
      }
      const psbtHex = psbt.toHex();

      const s = await wallet.signPsbtReturnHex(psbtHex, { autoFinalized: true });
      const signPsbt = Psbt.fromHex(s);
      const tx = signPsbt.extractTransaction();
      try {
        const validate = await wallet.validateAtomical(tx.toHex());
        if (validate) {
          const rawTxInfo: RawTxInfo = {
            psbtHex,
            rawtx: tx.toHex(),
            toAddressInfo,
            fee: expectedSatoshisDeposit
          };
          return rawTxInfo;
        } else {
          return {
            psbtHex: '',
            rawtx: '',
            toAddressInfo,
            err: validate.message
          };
        }
      } catch (err) {
        return {
          psbtHex: '',
          rawtx: '',
          err: 'unknown method blockchain.atomicals.validate'
        };
      }
    },
    [dispatch, wallet, account, fromAddress]
  );
}

export function useCreateARCNFTTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const account = useCurrentAccount();
  const fromAddress = useAccountAddress();
  const atomicals = useAtomicals();
  return useCallback(
    async (
      transferOptions: {
        selectedUtxos: UTXO[];
        outputs: { address: string; value: number }[];
      },
      toAddressInfo: ToAddressInfo,
      satsbyte: number
    ): Promise<RawTxInfo | undefined> => {
      const pubkey = account.pubkey;
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
      try {
        detectAddressTypeToScripthash(toAddressInfo.address);
      } catch (e) {
        return {
          psbtHex: '',
          rawtx: '',
          toAddressInfo,
          err: 'Please ensure all addresses have been entered correctly.'
        };
      }

      for (const utxo of transferOptions.selectedUtxos) {
        const utxoInput = utxoToInput({
          utxo,
          addressType: getAddressType(fromAddress),
          pubkey,
          script: atomicals.output
        });
        if (utxoInput) {
          psbt.addInput(utxoInput.data);
        } else {
          return {
            psbtHex: '',
            rawtx: '',
            toAddressInfo,
            err: 'Please ensure all addresses have been entered correctly.'
          };
        }
      }

      for (const output of transferOptions.outputs) {
        psbt.addOutput({
          value: output.value,
          address: output.address
        });
      }
      let expectedFundinng = 0;
      const expectedSatoshisDeposit = transferOptions.selectedUtxos.reduce((a, b) => {
        let ret = calculateFundsRequired(b.value, b.value, satsbyte).expectedSatoshisDeposit;
        if (ret < 0) {
          ret = calculateFundsRequired(0, b.value, satsbyte).expectedSatoshisDeposit;
        }
        return a + ret;
      }, 0);

      if (transferOptions.selectedUtxos.length === 0) {
        expectedFundinng = 0;
      } else {
        expectedFundinng = expectedSatoshisDeposit;
      }

      let addedValue = 0;
      const addedInputs: UTXO[] = [];

      for (let i = 0; i < atomicals.regularsUTXOs.length; i++) {
        const utxo = atomicals.regularsUTXOs[i];

        if (addedValue >= expectedSatoshisDeposit) {
          break;
        } else {
          addedValue += utxo.value;
          addedInputs.push(utxo);
          const utxoInput = utxoToInput({
            utxo,
            addressType: getAddressType(fromAddress),
            pubkey,
            script: atomicals.output
          });
          if (utxoInput) {
            psbt.addInput(utxoInput.data);
          }
        }
      }

      if (addedValue - expectedSatoshisDeposit >= 546) {
        psbt.addOutput({
          value: addedValue - expectedSatoshisDeposit,
          address: fromAddress
        });
      }
      const psbtHex = psbt.toHex();

      const s = await wallet.signPsbtReturnHex(psbtHex, { autoFinalized: true });

      const signPsbt = Psbt.fromHex(s);
      const tx = signPsbt.extractTransaction();

      const rawTxInfo: RawTxInfo = {
        psbtHex,
        rawtx: tx.toHex(),
        toAddressInfo,
        fee: expectedFundinng
      };
      return rawTxInfo;
    },
    [dispatch, wallet, account, fromAddress]
  );
}

export function usePushBitcoinTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const tools = useTools();
  return useCallback(
    async (rawtx: string) => {
      const ret = {
        success: false,
        txid: '',
        error: ''
      };
      try {
        tools.showLoading(true);
        const txid = await wallet.pushTx(rawtx);
        await sleep(3); // Wait for transaction synchronization
        tools.showLoading(false);
        dispatch(transactionsActions.updateBitcoinTx({ txid }));
        dispatch(accountActions.expireBalance());
        setTimeout(() => {
          dispatch(accountActions.expireBalance());
        }, 2000);
        setTimeout(() => {
          dispatch(accountActions.expireBalance());
        }, 5000);
        // dispatch(accountActions.f());
        ret.success = true;
        ret.txid = txid;
      } catch (e) {
        ret.error = (e as Error).message;
        tools.showLoading(false);
      }

      return ret;
    },
    [dispatch, wallet]
  );
}

export function useOrdinalsTx() {
  const transactionsState = useTransactionsState();
  return transactionsState.ordinalsTx;
}

export function useCreateOrdinalsTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const fromAddress = useAccountAddress();
  const utxos = useUtxos();
  return useCallback(
    async (toAddressInfo: ToAddressInfo, inscriptionId: string, feeRate: number, outputValue: number) => {
      const psbtHex = await wallet.sendInscription({
        to: toAddressInfo.address,
        inscriptionId,
        feeRate,
        outputValue
      });
      const psbt = Psbt.fromHex(psbtHex);
      const rawtx = psbt.extractTransaction().toHex();
      dispatch(
        transactionsActions.updateOrdinalsTx({
          rawtx,
          psbtHex,
          fromAddress,
          // inscription,
          feeRate,
          outputValue
        })
      );
      const rawTxInfo: RawTxInfo = {
        psbtHex,
        rawtx,
        toAddressInfo
      };
      return rawTxInfo;
    },
    [dispatch, wallet, fromAddress, utxos]
  );
}

export function useCreateMultiOrdinalsTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const fromAddress = useAccountAddress();
  const utxos = useUtxos();
  return useCallback(
    async (toAddressInfo: ToAddressInfo, inscriptionIds: string[], feeRate?: number) => {
      if (!feeRate) {
        const summary = await wallet.getFeeSummary();
        feeRate = summary.list[1].feeRate;
      }
      const psbtHex = await wallet.sendInscriptions({
        to: toAddressInfo.address,
        inscriptionIds,
        feeRate
      });
      const psbt = Psbt.fromHex(psbtHex);
      const rawtx = psbt.extractTransaction().toHex();
      dispatch(
        transactionsActions.updateOrdinalsTx({
          rawtx,
          psbtHex,
          fromAddress,
          feeRate
        })
      );
      const rawTxInfo: RawTxInfo = {
        psbtHex,
        rawtx,
        toAddressInfo
      };
      return rawTxInfo;
    },
    [dispatch, wallet, fromAddress, utxos]
  );
}

export function useCreateSplitTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const fromAddress = useAccountAddress();
  const utxos = useUtxos();
  return useCallback(
    async (inscriptionId: string, feeRate: number, outputValue: number) => {
      const { psbtHex, splitedCount } = await wallet.splitInscription({
        inscriptionId,
        feeRate,
        outputValue
      });
      const psbt = Psbt.fromHex(psbtHex);
      const rawtx = psbt.extractTransaction().toHex();
      dispatch(
        transactionsActions.updateOrdinalsTx({
          rawtx,
          psbtHex,
          fromAddress,
          // inscription,
          feeRate,
          outputValue
        })
      );
      const rawTxInfo: RawTxInfo = {
        psbtHex,
        rawtx,
        toAddressInfo: {
          address: fromAddress
        }
      };
      return { rawTxInfo, splitedCount };
    },
    [dispatch, wallet, fromAddress, utxos]
  );
}

export function usePushOrdinalsTxCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const tools = useTools();
  return useCallback(
    async (rawtx: string) => {
      const ret = {
        success: false,
        txid: '',
        error: ''
      };
      try {
        tools.showLoading(true);
        const txid = await wallet.pushTx(rawtx);
        await sleep(3); // Wait for transaction synchronization
        tools.showLoading(false);
        dispatch(transactionsActions.updateOrdinalsTx({ txid }));

        dispatch(accountActions.expireBalance());
        setTimeout(() => {
          dispatch(accountActions.expireBalance());
        }, 2000);
        setTimeout(() => {
          dispatch(accountActions.expireBalance());
        }, 5000);

        ret.success = true;
        ret.txid = txid;
      } catch (e) {
        console.log(e);
        ret.error = (e as Error).message;
        tools.showLoading(false);
      }

      return ret;
    },
    [dispatch, wallet]
  );
}

export function useUtxos() {
  const transactionsState = useTransactionsState();
  return transactionsState.utxos;
}

export function useFetchUtxosCallback() {
  const dispatch = useAppDispatch();
  const wallet = useWallet();
  const account = useCurrentAccount();
  return useCallback(async () => {
    const data = await wallet.getAddressUtxo(account.address);
    dispatch(transactionsActions.setUtxos(data));
    return data;
  }, [wallet, account]);
}

export function useSafeBalance() {
  const utxos = useUtxos();
  return useMemo(() => {
    const satoshis = utxos.filter((v) => v.inscriptions.length === 0).reduce((pre, cur) => pre + cur.satoshis, 0);
    return satoshisToBTC(satoshis);
  }, [utxos]);
}
