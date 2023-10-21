
// import { TokenBalance } from '@/shared/types';

import { Card } from '../Card';
import { Column } from '../Column';
import { Row } from '../Row';
import { Text } from '../Text';
import { returnImageType } from '@/ui/utils';
import { Image } from '../Image';
import { IAtomicalItem } from '@/background/service/interfaces/api';

export interface ARC20BalanceCardProps {
  tokenBalance: IAtomicalItem;
  onClick?: () => void;
}

export default function ARC20BalanceCard(props: ARC20BalanceCardProps) {
  const {
    tokenBalance: { $ticker, value, mint_data },
    onClick
  } = props;

  const { type, content, tag} = returnImageType(props.tokenBalance)

  return (
    <Card
      style={{
        backgroundColor: '#141414',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        width: 150,
        height: 120,
        minWidth: 150,
        minHeight: 120
      }}
      onClick={onClick}>
      <Column full>
        <Row justifyBetween itemsCenter>
          <Row itemsCenter>
            {
              content && (
                <Image
                  size={16}
                  src={content}
                />
              )
            }
            <Text text={$ticker} color="blue" />
          </Row>
          {/* <Tooltip
            title="The transferable amount is the balance that has been inscribed into transfer inscriptions but has not yet been sent."
            overlayStyle={{
              fontSize: fontSizes.xs
            }}>
            <InfoCircleOutlined
              style={{
                fontSize: fontSizes.xs,
                color: colors.textDim
              }}
            />
          </Tooltip> */}
        </Row>

        <Row style={{ borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
        <Row justifyBetween itemsCenter>
          <Text text="Balance:" color="textDim" size="xs" />
          <Text text={value.toLocaleString()} size="xs" />
        </Row>
      </Column>
    </Card>
  );
}
