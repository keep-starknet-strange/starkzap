import { View } from "react-native";
import { Card, Text, RemoteImage } from "@/ui";
import { useTheme } from "@/theme";
import { useBalancesStore } from "./store";

const ICON = 36;

export function BalancesCard() {
  const { colors, spacing } = useTheme();
  const { balances, loading, error } = useBalancesStore();

  if (error) return <Text style={{ color: colors.danger }}>{error}</Text>;
  if (!loading && balances.length === 0)
    return <Text variant="muted">Pull to refresh</Text>;

  return (
    <>
      {balances.map(({ token, amount }) => {
        const logo = token.metadata?.logoUrl?.href;
        return (
          <Card key={token.address}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  flexShrink: 1,
                }}
              >
                {logo ? (
                  <RemoteImage uri={logo} size={ICON} />
                ) : (
                  <View
                    style={{
                      width: ICON,
                      height: ICON,
                      borderRadius: ICON / 2,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text variant="muted">{token.symbol[0]}</Text>
                  </View>
                )}
                <View style={{ flexShrink: 1 }}>
                  <Text variant="body">{token.name}</Text>
                  <Text variant="muted">{token.symbol}</Text>
                </View>
              </View>
              <Text variant="body">{amount.toFormatted(true)}</Text>
            </View>
          </Card>
        );
      })}
    </>
  );
}
