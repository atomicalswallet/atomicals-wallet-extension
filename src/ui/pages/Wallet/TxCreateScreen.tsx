import { useEffect, useMemo, useState } from 'react';

import { DUST_AMOUNT } from '@/shared/constant';
import { Inscription, RawTxInfo } from '@/shared/types';
import { Layout, Content, Button, Header, Icon, Text, Input, Column, Row } from '@/ui/components';
import { FeeRateBar } from '@/ui/components/FeeRateBar';
import { useNavigate } from '@/ui/pages/MainRoute';
import { useAccountBalance, useAtomicals } from '@/ui/state/accounts/hooks';
import {
  useBitcoinTx,
  useCreateBitcoinTxCallback,
  useFetchUtxosCallback,
  useSafeBalance
} from '@/ui/state/transactions/hooks';
import { colors } from '@/ui/theme/colors';
import { amountToSatoshis, isValidAddress, satoshisToAmount } from '@/ui/utils';

export default function TxCreateScreen() {
  const accountBalance = useAccountBalance();
  const safeBalance = useSafeBalance();
  const navigate = useNavigate();
  const bitcoinTx = useBitcoinTx();
  const [inputAmount, setInputAmount] = useState(
    bitcoinTx.toSatoshis > 0 ? satoshisToAmount(bitcoinTx.toSatoshis) : ''
  );
  const [disabled, setDisabled] = useState(true);
  const [toInfo, setToInfo] = useState<{
    address: string;
    domain: string;
    inscription?: Inscription;
  }>({
    address: bitcoinTx.toAddress,
    domain: bitcoinTx.toDomain,
    inscription: undefined
  });

  const [error, setError] = useState('');

  const [autoAdjust, setAutoAdjust] = useState(false);
  const fetchUtxos = useFetchUtxosCallback();

  useEffect(() => {
    fetchUtxos();
  }, []);

  const createBitcoinTx = useCreateBitcoinTxCallback();

  const safeSatoshis = useMemo(() => {
    return amountToSatoshis(safeBalance);
  }, [safeBalance]);

  const toSatoshis = useMemo(() => {
    if (!inputAmount) return 0;
    return amountToSatoshis(inputAmount);
  }, [inputAmount]);

  const dustAmount = useMemo(() => satoshisToAmount(DUST_AMOUNT), [DUST_AMOUNT]);

  const [feeRate, setFeeRate] = useState(5);
  const atomicals = useAtomicals();
  const [testValue, settestValue] = useState('')

  const [rawTxInfo, setRawTxInfo] = useState<RawTxInfo>();
  useEffect(() => {
    setError('');
    setDisabled(true);

    if (!isValidAddress(toInfo.address)) {
      return;
    }
    if (!toSatoshis) {
      return;
    }
    if (toSatoshis < DUST_AMOUNT) {
      setError(`Amount must be at least ${dustAmount} BTC`);
      return;
    }

    if (toSatoshis > safeSatoshis) {
      setError('Amount exceeds your available balance');
      return;
    }

    if (feeRate <= 0) {
      return;
    }

    if (
      toInfo.address == bitcoinTx.toAddress &&
      toSatoshis == bitcoinTx.toSatoshis &&
      autoAdjust == bitcoinTx.autoAdjust &&
      feeRate == bitcoinTx.feeRate
    ) {
      //Prevent repeated triggering caused by setAmount
      setDisabled(false);
      return;
    }

    createBitcoinTx(toInfo, toSatoshis, feeRate, autoAdjust)
      .then((data) => {
        // if (data.fee < data.estimateFee) {
        //   setError(`Network fee must be at leat ${data.estimateFee}`);
        //   return;
        // }
        console.log('then', data);
        setRawTxInfo(data);
        setDisabled(false);
      })
      .catch((e) => {
        console.log('catch', e);
        setAutoAdjust(false)
        setError(e.message);
      });
  }, [toInfo, inputAmount, autoAdjust, feeRate]);

  const showSafeBalance = useMemo(() => {
    return true;
    // return new BigNumber(accountBalance.amount).eq(new BigNumber(safeBalance)) == false;
  }, [accountBalance.amount, safeBalance]);

  return (
    <Layout>
      <Header
        onBack={() => {
          window.history.go(-1);
        }}
        title="Send BTC"
      />
      <Content>
        <Row justifyCenter>
          <Icon icon="btc" size={50} />
        </Row>

        <Column mt="lg">
          <Text text="Recipient" preset="regular" color="textDim" />
          <Input
            preset="address"
            addressInputData={toInfo}
            onAddressInputChange={(val) => {
              setToInfo(val);
            }}
            autoFocus={true}
          />
        </Column>

        <Column mt="lg">
          <Row justifyBetween>
            <Text text="Balance" color="textDim" />
            {showSafeBalance ? (
              <Text text={`${accountBalance.amount} BTC`} preset="bold" size="sm" />
            ) : (
              <Row
                onClick={() => {
                  setInputAmount(accountBalance.btc_amount.toString());
                  setAutoAdjust(true);
                }}>
                <Text
                  text="MAX"
                  preset="sub"
                  style={{ color: autoAdjust ? colors.yellow_light : colors.white_muted }}
                />
                <Text text={`${accountBalance.amount} BTC`} preset="bold" size="sm" />
              </Row>
            )}
          </Row>
          {showSafeBalance && (
            <Row justifyBetween>
              <Text text="Available (safe to send)" color="textDim" />

              <Row
                onClick={() => {
                  setInputAmount(accountBalance.btc_amount.toString());
                  setAutoAdjust(true);
                }}>
                <Text text={'MAX'} color={autoAdjust ? 'yellow' : 'textDim'} size="sm" />
                <Text text={`${accountBalance.btc_amount} BTC`} preset="bold" size="sm" />
              </Row>
            </Row>
          )}
          <Input
            preset="amount"
            placeholder={'Amount'}
            defaultValue={inputAmount}
            // value={inputAmount}
            onAmountInputChange={(amount) => {
              if (autoAdjust == true) {
                setAutoAdjust(false);
              }
              setInputAmount(amount);
            }}
          />
        </Column>

        <Column mt="lg">
          <Text text="Fee" color="textDim" />

          <FeeRateBar
            onChange={(val) => {
              setFeeRate(val);
            }}
          />
        </Column>

        {error && <Text text={error} color="error" />}
        <Button
          disabled={disabled}
          preset="primary"
          text="Next"
          onClick={(e) => {
            if(rawTxInfo?.err) {
              setError(rawTxInfo.err);
              return
            }
            navigate('TxConfirmScreen', { rawTxInfo });
          }}></Button>
      </Content>
    </Layout>
  );
}
