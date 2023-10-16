import { ATOM_NETWORK_TYPES } from '@/shared/constant';
import { Content, Header, Layout, Icon, Column, Row, Card, Text } from '@/ui/components';
import { useAtomNetworkType, useChangeAtomNetworkTypeCallback } from '@/ui/state/settings/hooks';

export default function EndPointScreen() {
  const networkType = useAtomNetworkType();
  // const changeNetworkType = useChangeNetworkTypeCallback();
  const changeAtomNetworkType = useChangeAtomNetworkTypeCallback()
  console.log('networkScreen', networkType)
  return (
    <Layout>
      <Header
        onBack={() => {
          window.history.go(-1);
        }}
        title="Switch Network"
      />
      <Content>
        <Column>
          {ATOM_NETWORK_TYPES.map((item, index) => {
            return (
              <Card
                key={index}
                onClick={async () => {
                  await changeAtomNetworkType(item.value);
                  // window.location.reload();
                }}>
                <Row full justifyBetween itemsCenter>
                  <Row itemsCenter>
                    <Text text={item.label} preset="regular-bold" />
                  </Row>
                  <Column>{item.value == networkType && <Icon icon="check" />}</Column>
                </Row>
              </Card>
            );
          })}
        </Column>
      </Content>
    </Layout>
  );
}
