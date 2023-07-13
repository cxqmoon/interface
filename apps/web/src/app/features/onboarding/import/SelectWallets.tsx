import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import WalletPreviewCard from 'src/app/components/WalletPreviewCard'
import { OnboardingScreen } from 'src/app/features/onboarding/OnboardingScreen'
import {
  ImportOnboardingRoutes,
  OnboardingRoutes,
  TopLevelRoutes,
} from 'src/app/navigation/constants'
import { useAppDispatch } from 'src/background/store'
import { Icons, ScrollView, Stack, Text, XStack, YStack } from 'ui/src'
import { Button } from 'ui/src/components/button/Button'
import { useSelectWalletScreenQuery } from 'wallet/src/data/__generated__/types-and-hooks'
import {
  EditAccountAction,
  editAccountActions,
} from 'wallet/src/features/wallet/accounts/editAccountSaga'
import { AccountType, SignerMnemonicAccount } from 'wallet/src/features/wallet/accounts/types'
import {
  PendingAccountActions,
  pendingAccountActions,
} from 'wallet/src/features/wallet/create/pendingAccountsSaga'
import { usePendingAccounts } from 'wallet/src/features/wallet/hooks'
import { NUMBER_OF_WALLETS_TO_IMPORT } from 'wallet/src/features/wallet/import/utils'
import { setAccountAsActive } from 'wallet/src/features/wallet/slice'
import { ONE_SECOND_MS } from 'wallet/src/utils/time'
import { useTimeout } from 'wallet/src/utils/timing'

const FORCED_LOADING_DURATION = 3 * ONE_SECOND_MS // 3s

interface ImportableAccount {
  ownerAddress: string
  balance: number | undefined
}

function isImportableAccount(account: {
  ownerAddress: string | undefined
  balance: Maybe<number>
}): account is ImportableAccount {
  return (account as ImportableAccount).ownerAddress !== undefined
}

const SPIN_SPEED = 1000

export function SelectWallets(): JSX.Element {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const pendingAccounts = usePendingAccounts()
  const addresses = Object.values(pendingAccounts)
    .filter((a) => a.type === AccountType.SignerMnemonic)
    .sort(
      (a, b) =>
        (a as SignerMnemonicAccount).derivationIndex - (b as SignerMnemonicAccount).derivationIndex
    )
    .map((account) => account.address)

  const isImportingAccounts = addresses.length !== NUMBER_OF_WALLETS_TO_IMPORT

  const { data, loading, refetch, error } = useSelectWalletScreenQuery({
    variables: { ownerAddresses: addresses },
    /*
     * Wait until all the addresses have been added to the store before querying.
     * Also prevents an extra API call when user navigates back and clears pending accounts.
     */
    skip: isImportingAccounts,
  })

  const onRetry = useCallback(() => {
    setIsForcedLoading(true)
    refetch()
  }, [refetch])

  const allAddressBalances = data?.portfolios

  const initialShownAccounts = useMemo<ImportableAccount[] | undefined>(() => {
    const filteredAccounts = allAddressBalances
      ?.map((address) => ({
        ownerAddress: address?.ownerAddress,
        balance: address?.tokensTotalDenominatedValue?.value,
      }))
      .filter(isImportableAccount)

    const accountsWithBalance = filteredAccounts?.filter(
      (address) => address.balance && address.balance > 0
    )

    if (accountsWithBalance?.length) return accountsWithBalance

    // if all addresses have 0 total token value, show the first address
    const firstFilteredAccount = filteredAccounts?.[0]
    if (firstFilteredAccount) return [firstFilteredAccount]

    // if query for address balances returned null, show the first address
    const firstPendingAddress = addresses[0]
    if (firstPendingAddress) return [{ ownerAddress: firstPendingAddress, balance: undefined }]
  }, [addresses, allAddressBalances])

  const initialSelectedAddresses = useMemo(
    () =>
      initialShownAccounts
        ?.map((account) => account?.ownerAddress)
        .filter((address): address is string => typeof address === 'string') ?? [],
    [initialShownAccounts]
  )

  const isOnlyOneAccount = initialShownAccounts?.length === 1

  const showError = error && !initialShownAccounts?.length

  const [selectedAddresses, setSelectedAddresses] = useReducer(
    (currentAddresses: string[], addressToProcess: string) =>
      currentAddresses.includes(addressToProcess)
        ? currentAddresses.filter((address) => address !== addressToProcess)
        : [...currentAddresses, addressToProcess],
    initialSelectedAddresses
  )

  const onPress = (address: string): void => {
    if (initialShownAccounts?.length === 1 && selectedAddresses.length === 1) return
    setSelectedAddresses(address)
  }

  useEffect(() => {
    /*
     * In the event that the initial state of `selectedAddresses` is empty due to
     * delay in importAccountSaga, we need to set the fallback account as selected
     */
    if (isImportingAccounts || loading || selectedAddresses.length > 0) return

    initialShownAccounts
      ?.filter((a) => a != null && a?.ownerAddress != null)
      .map((a) => setSelectedAddresses(a.ownerAddress))
  }, [initialShownAccounts, isImportingAccounts, loading, selectedAddresses.length])

  const isFirstAccountActive = useRef(false) // to keep track of first account activated from the selected accounts
  const onSubmit = useCallback(() => {
    addresses.forEach((address) => {
      // Remove unselected accounts from store.
      if (!selectedAddresses.includes(address)) {
        dispatch(
          editAccountActions.trigger({
            type: EditAccountAction.Remove,
            address,
            // notificationsEnabled: !!pendingAccounts[address]?.pushNotificationsEnabled,
          })
        )
      } else {
        if (!isFirstAccountActive.current) {
          dispatch(setAccountAsActive(address))
          isFirstAccountActive.current = true
        }
        const account = pendingAccounts[address]
        if (account && !account.name && account.type !== AccountType.Readonly) {
          dispatch(
            editAccountActions.trigger({
              type: EditAccountAction.Rename,
              address,
              newName: `Wallet ${account.derivationIndex + 1}`,
            })
          )
        }
      }
    })
    dispatch(pendingAccountActions.trigger(PendingAccountActions.Activate))
    navigate(
      `/${TopLevelRoutes.Onboarding}/${OnboardingRoutes.Import}/${ImportOnboardingRoutes.Complete}`,
      { replace: true }
    )
  }, [addresses, navigate, selectedAddresses, dispatch, pendingAccounts])

  // Force a fixed duration loading state for smoother transition (as we show different UI for 1 vs multiple wallets)
  const [isForcedLoading, setIsForcedLoading] = useState(true)
  useTimeout(() => setIsForcedLoading(false), FORCED_LOADING_DURATION)

  const isLoading = loading || isForcedLoading || isImportingAccounts

  const title = isOnlyOneAccount
    ? t('One wallet found')
    : showError
    ? t('Error importing wallets')
    : t('Select wallets to import')

  const subtitle = isOnlyOneAccount
    ? t('Please confirm that the wallet below is the one you’d like to import.')
    : showError
    ? t('Something went wrong and your wallets couldn’t be imported.')
    : t(
        'You can import any of your wallet addresses that are associated with your recovery phrase.'
      )

  if (isLoading) {
    return (
      <YStack alignItems="center" gap="$spacing36" justifyContent="center">
        <Stack height={80} position="relative" width={80}>
          <Stack bottom={0} left={0} position="absolute" right={0} top={0}>
            <Icons.LoadingSpinnerOuter color="$brandedAccentSoft" size={80} />
          </Stack>
          <Stack
            bottom={0}
            left={0}
            position="absolute"
            right={0}
            style={{ animation: `spin ${SPIN_SPEED}ms linear infinite` }}
            top={0}>
            <Icons.LoadingSpinnerInner color="$magentaVibrant" size={80} />
          </Stack>
        </Stack>
        <Text color="$textSecondary" textAlign="center" variant="headlineSmall">
          Finding your wallets...
        </Text>
      </YStack>
    )
  }

  return (
    <OnboardingScreen
      nextButtonEnabled={!isImportingAccounts && !showError && selectedAddresses.length > 0}
      nextButtonText="Continue"
      subtitle={subtitle}
      title={title}
      onBack={(): void =>
        navigate(
          `/${TopLevelRoutes.Onboarding}/${OnboardingRoutes.Import}/${ImportOnboardingRoutes.Mnemonic}`,
          {
            replace: true,
          }
        )
      }
      onSubmit={onSubmit}>
      <ScrollView height={180} showsVerticalScrollIndicator={false} width="100%">
        {showError ? (
          <Stack
            gap="$spacing24"
            // @ts-expect-error were using spacing for size, but its ok...
            p="spacing12"
            width="100%">
            <Text color="$accentCritical" textAlign="center" variant="buttonLabelMedium">
              Couldn't load addresses
            </Text>
            <XStack justifyContent="center">
              <Button theme="secondary" onPress={onRetry}>
                Retry
              </Button>
            </XStack>
          </Stack>
        ) : (
          <YStack gap="$spacing12" position="relative" width="100%">
            {initialShownAccounts?.map((account) => {
              const { ownerAddress, balance } = account
              return (
                <WalletPreviewCard
                  key={ownerAddress}
                  address={ownerAddress}
                  balance={balance}
                  hideSelectionCircle={isOnlyOneAccount}
                  selected={selectedAddresses.includes(ownerAddress)}
                  onSelect={onPress}
                />
              )
            })}
          </YStack>
        )}
      </ScrollView>
    </OnboardingScreen>
  )
}