import { WarningIcon } from '@chakra-ui/icons'
import { Menu, MenuButton, MenuGroup, MenuItem, MenuList } from '@chakra-ui/menu'
import type { BoxProps } from '@chakra-ui/react'
import { Box, Button, Flex, Text, Tooltip, useColorModeValue } from '@chakra-ui/react'
import type { ChainId } from '@shapeshiftoss/caip'
import { fromChainId } from '@shapeshiftoss/caip'
import type { ETHWallet } from '@shapeshiftoss/hdwallet-core'
import { supportsEthSwitchChain } from '@shapeshiftoss/hdwallet-core'
import { AssetIcon } from 'components/AssetIcon'
import { CircleIcon } from 'components/Icons/Circle'
import { getChainAdapterManager } from 'context/PluginProvider/chainAdapterSingleton'
import { useEvm } from 'hooks/useEvm/useEvm'
import { useWallet } from 'hooks/useWallet/useWallet'
import { useMemo } from 'react'
import { useTranslate } from 'react-polyglot'
import { selectAssetById } from 'state/slices/selectors'
import { useAppSelector } from 'state/store'

const ChainMenuItem: React.FC<{
  chainId: ChainId
  onClick: (chainId: ChainId) => void
  isConnected: boolean
}> = ({ chainId, onClick, isConnected }) => {
  const chainAdapterManager = getChainAdapterManager()
  const chainName = chainAdapterManager.get(chainId)?.getDisplayName()
  const { chainReference: ethNetwork } = fromChainId(chainId)
  const nativeAssetId = chainAdapterManager.get(chainId)?.getFeeAssetId()
  const nativeAsset = useAppSelector(state => selectAssetById(state, nativeAssetId ?? ''))

  const connectedIconColor = useColorModeValue('green.500', 'green.200')
  const connectedChainBgColor = useColorModeValue('blackAlpha.100', 'whiteAlpha.50')

  if (!nativeAsset) return null

  return (
    <MenuItem
      icon={<AssetIcon src={nativeAsset.icon} width='6' height='auto' />}
      backgroundColor={isConnected ? connectedChainBgColor : undefined}
      onClick={() => onClick(ethNetwork)}
      borderRadius='lg'
    >
      <Flex justifyContent={'space-between'}>
        <Text>{chainName}</Text>
        <Box>{isConnected && <CircleIcon color={connectedIconColor} w={2} />}</Box>
      </Flex>
    </MenuItem>
  )
}

type ChainMenuProps = BoxProps

export const ChainMenu = (props: ChainMenuProps) => {
  const { state } = useWallet()
  const { isLoading, supportedEvmChainIds, connectedEvmChainId, setEthNetwork } = useEvm()
  const chainAdapterManager = getChainAdapterManager()
  const translate = useTranslate()

  const handleChainClick = async (chainId: ChainId) => {
    try {
      // @ts-expect-error
      await (state.wallet as ETHWallet).ethSwitchChain?.(Number(chainId))
      setEthNetwork(chainId)
    } catch (e) {
      // TODO: Handle me after https://github.com/shapeshift/hdwallet/pull/551 is published
    }
  }

  const currentChainNativeAssetId = useMemo(
    () => chainAdapterManager.get(connectedEvmChainId ?? '')?.getFeeAssetId(),
    [chainAdapterManager, connectedEvmChainId],
  )
  const currentChainNativeAsset = useAppSelector(state =>
    selectAssetById(state, currentChainNativeAssetId ?? ''),
  )

  const canSwitchChains = useMemo(
    () => !isLoading && (supportedEvmChainIds.length > 1 || !connectedEvmChainId),
    [isLoading, connectedEvmChainId, supportedEvmChainIds.length],
  )
  if (!state.wallet) return null
  if (!supportsEthSwitchChain(state.wallet)) return null

  // don't show the menu if there is only one chain
  if (!canSwitchChains) return null

  return (
    <Box {...props}>
      <Menu autoSelect={false}>
        <Tooltip
          label={translate(
            currentChainNativeAsset ? 'common.switchNetwork' : 'common.unsupportedNetwork',
          )}
          isDisabled={!canSwitchChains}
        >
          <MenuButton as={Button} iconSpacing={2} px={2} width={{ base: 'full', md: 'auto' }}>
            <Flex alignItems='center' justifyContent='center'>
              {currentChainNativeAsset ? (
                <AssetIcon src={currentChainNativeAsset.icon} size='xs' />
              ) : (
                <WarningIcon color='yellow.300' boxSize='4' />
              )}
            </Flex>
          </MenuButton>
        </Tooltip>

        <MenuList p='10px' zIndex={2}>
          <MenuGroup title={'Select a network'} ml={3} color='gray.500'>
            {supportedEvmChainIds.map(chainId => (
              <ChainMenuItem
                isConnected={chainId === connectedEvmChainId}
                key={chainId}
                chainId={chainId}
                onClick={handleChainClick}
              />
            ))}
          </MenuGroup>
        </MenuList>
      </Menu>
    </Box>
  )
}
