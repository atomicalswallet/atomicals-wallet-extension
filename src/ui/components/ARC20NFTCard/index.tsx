
// import { TokenBalance } from '@/shared/types';
import { Card } from '../Card';
import { Column } from '../Column';
import { Row } from '../Row';
import { Text } from '../Text';
import { returnImageType } from '@/ui/utils';
import { Image } from '../Image';
import { Tag } from '../Tag';
import Checkbox from '../Checkbox';
import { IAtomicalItem } from '@/background/service/interfaces/api';
// import Checkbox from '../Checkbox';

export interface ARC20NFTCardProps {
  tokenBalance: IAtomicalItem;
  onClick?: () => void;
  checkbox?: boolean;
  selectvalues?: string[];
}

export default function ARC20NFTCard(props: ARC20NFTCardProps) {
  const {
    tokenBalance: { $ticker, value, mint_data, atomical_number, atomical_id },
    checkbox,
    selectvalues,
    onClick
  } = props;

  const { type, content, tag } = returnImageType(props.tokenBalance);

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
      <Column full gap={'xs'}>
        <Row justifyBetween itemsCenter>
          <Text text={`# ${atomical_number.toLocaleString()}`} color="blue" />
          {checkbox && (
            <Checkbox value={`${atomical_id}`} checked={selectvalues?.includes(`${atomical_id}`)} />
          )}
        </Row>
        <Row style={{ borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
        <Column>
          <div>{type === 'nft' ? <Tag preset="default" text={tag} /> : <Tag preset="success" text={'Realm'} />}</div>
          <Row justifyCenter>
            {type === 'nft' ? <Image size={24} src={content} /> : <Text text={content} color="textDim" size="xl" />}
          </Row>
          <Text text={`${value.toLocaleString()} sats`} size="xs" />
        </Column>
      </Column>
    </Card>
  );
}
