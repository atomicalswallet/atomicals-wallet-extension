import VirtualList from 'rc-virtual-list';
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';

import { KEYRING_TYPE } from '@/shared/constant';
import { WalletKeyring } from '@/shared/types';
import { Button, Card, Column, Content, Header, Icon, Layout, Row, Text } from '@/ui/components';
import { useTools } from '@/ui/components/ActionComponent';
import { RemoveWalletPopover } from '@/ui/components/RemoveWalletPopover';
import { accountActions } from '@/ui/state/accounts/reducer';
import { useAppDispatch } from '@/ui/state/hooks';
import { useCurrentKeyring, useKeyrings } from '@/ui/state/keyrings/hooks';
import { keyringsActions } from '@/ui/state/keyrings/reducer';
import { colors } from '@/ui/theme/colors';
import { shortAddress, useWallet } from '@/ui/utils';
import {
  CheckCircleFilled,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusCircleOutlined,
  SettingOutlined
} from '@ant-design/icons';

import { useNavigate } from '../MainRoute';

export interface ItemData {
  key: string;
  keyring: WalletKeyring;
}

interface MyItemProps {
  keyring: WalletKeyring;
  autoNav?: boolean;
}

export function MyItem({ keyring, autoNav }: MyItemProps, ref) {
  const navigate = useNavigate();
  const currentKeyring = useCurrentKeyring();
  const selected = currentKeyring.index === keyring?.index;
  const wallet = useWallet();

  const keyrings = useKeyrings();

  const dispatch = useAppDispatch();

  const tools = useTools();

  const displayAddress = useCallback(() => {
    if (keyring) {
      const address = keyring.accounts[0].address;
      return shortAddress(address);
    }
  }, [keyring]);

  const [optionsVisible, setOptionsVisible] = useState(false);
  const [removeVisible, setRemoveVisible] = useState(false);

  return (
    <Card justifyBetween mt="md">
      <Row
        full
        onClick={async (e) => {
          if (currentKeyring.key !== keyring.key) {
            await wallet.changeKeyring(keyring);
            dispatch(keyringsActions.setCurrent(keyring));
            const _currentAccount = await wallet.getCurrentAccount();
            dispatch(accountActions.setCurrent(_currentAccount));
          }
          if (autoNav) navigate('MainScreen');
        }}>
        <Column style={{ width: 20 }} selfItemsCenter>
          {selected && (
            <Icon>
              <CheckCircleFilled />
            </Icon>
          )}
        </Column>

        <Column justifyCenter>
          <Text text={`${keyring.alianName}`} />
          <Text text={`${displayAddress()}`} preset="sub" />
        </Column>
      </Row>

      <Column relative>
        {optionsVisible && (
          <div
            style={{
              position: 'fixed',
              zIndex: 10,
              left: 0,
              right: 0,
              top: 0,
              bottom: 0
            }}
            onTouchStart={(e) => {
              setOptionsVisible(false);
            }}
            onMouseDown={(e) => {
              setOptionsVisible(false);
            }}></div>
        )}

        <Icon
          onClick={async (e) => {
            setOptionsVisible(!optionsVisible);
          }}>
          <SettingOutlined />
        </Icon>

        {optionsVisible && (
          <Column
            style={{
              backgroundColor: colors.black,
              width: 180,
              position: 'absolute',
              right: 0,
              padding: 5,
              zIndex: 10
            }}>
            <Column>
              <Row
                onClick={() => {
                  navigate('EditWalletNameScreen', { keyring });
                }}>
                <EditOutlined />
                <Text text="Edit Name" size="sm" />
              </Row>

              {keyring.type === KEYRING_TYPE.HdKeyring ? (
                <Row
                  onClick={() => {
                    navigate('ExportMnemonicsScreen', { keyring });
                  }}>
                  <KeyOutlined />
                  <Text text="Show Secret Recovery Phrase" size="sm" />
                </Row>
              ) : (
                <Row
                  onClick={() => {
                    navigate('ExportPrivateKeyScreen', { account: keyring.accounts[0] });
                  }}>
                  <KeyOutlined />
                  <Text text="Export Private Key" size="sm" />
                </Row>
              )}
              <Row
                onClick={() => {
                  if (keyrings.length == 1) {
                    tools.toastError('Removing the last wallet is not allowed');
                    return;
                  }
                  setRemoveVisible(true);
                  setOptionsVisible(false);
                }}>
                <Icon color="danger">
                  <DeleteOutlined />
                </Icon>

                <Text text="Remove Wallet" size="sm" color="danger" />
              </Row>
            </Column>
          </Column>
        )}
      </Column>

      {removeVisible && (
        <RemoveWalletPopover
          keyring={keyring}
          onClose={() => {
            setRemoveVisible(false);
          }}
        />
      )}
    </Card>
  );
}

export default function SwitchKeyringScreen() {
  const navigate = useNavigate();

  const keyrings = useKeyrings();

  const [kItems, setKItems] = useState<ItemData[]>([]);

  useEffect(() => {
    if (keyrings && keyrings.length > 0) {
      const _items: ItemData[] = keyrings.map((v) => {
        return {
          key: v.key,
          keyring: v
        };
      });
      setKItems(_items);
    }
  }, [keyrings]);

  const manuallyLoadKeyRings = useCallback(async () => {
    const _items: ItemData[] = keyrings.map((v) => {
      return {
        key: v.key,
        keyring: v
      };
    });
    setKItems(_items);
  }, [keyrings]);

  const ForwardMyItem = forwardRef(MyItem);
  return (
    <Layout>
      <Header
        onBack={() => {
          window.history.go(-1);
        }}
        title="Switch Wallet"
        RightComponent={
          <Icon
            onClick={() => {
              navigate('AddKeyringScreen');
            }}>
            <PlusCircleOutlined />
          </Icon>
        }
      />
      <Content>
        {kItems.length > 0 ? (
          <VirtualList
            data={kItems}
            data-id="list"
            itemHeight={30}
            itemKey={(item) => item.key}
            // disabled={animating}
            style={{
              boxSizing: 'border-box'
            }}
            // onSkipRender={onAppear}
            // onItemRemove={onAppear}
          >
            {(item, index) => <ForwardMyItem keyring={item.keyring} autoNav={true} />}
          </VirtualList>
        ) : (
          <Button onClick={manuallyLoadKeyRings}>Click here to refresh</Button>
        )}
      </Content>
    </Layout>
  );
}
