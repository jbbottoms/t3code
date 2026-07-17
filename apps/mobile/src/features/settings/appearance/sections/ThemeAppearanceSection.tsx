import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../../../components/AppSymbol";
import { AppText as Text } from "../../../../components/AppText";
import { MOBILE_THEME_OPTIONS, type MobileThemeOption } from "../../../../lib/mobileThemes";
import { useThemeColor } from "../../../../lib/useThemeColor";
import { SettingsSection } from "../../components/SettingsSection";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

function ThemeCard(props: {
  readonly disabled: boolean;
  readonly option: MobileThemeOption;
  readonly selected: boolean;
  readonly onSelect: (option: MobileThemeOption) => void;
}) {
  const border = String(useThemeColor("--color-border"));
  const selectedBorder = String(useThemeColor("--color-primary"));
  const pressedOverlay = String(useThemeColor("--color-subtle-strong"));

  return (
    <Pressable
      accessibilityLabel={`${props.option.label}, ${props.option.description}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected, disabled: props.disabled }}
      disabled={props.disabled}
      className="overflow-hidden rounded-[18px]"
      style={({ pressed }) => ({
        borderColor: props.selected ? selectedBorder : border,
        borderWidth: props.selected ? 2 : 1,
        flexBasis: "46%",
        flexGrow: 1,
        minWidth: 138,
        opacity: props.disabled ? 0.45 : pressed ? 0.74 : 1,
        backgroundColor: pressed ? pressedOverlay : undefined,
      })}
      onPress={() => props.onSelect(props.option)}
    >
      <View
        className="h-16 flex-row items-end gap-1.5 p-2.5"
        style={{ backgroundColor: props.option.swatches[0] }}
      >
        {props.option.swatches.slice(1).map((color, index) => (
          <View
            className="h-5 flex-1 rounded-full"
            key={color}
            style={{ backgroundColor: color, opacity: 1 - index * 0.12 }}
          />
        ))}
        {props.selected ? (
          <View
            className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: props.option.swatches[1] }}
          >
            <SymbolView
              name="checkmark"
              size={14}
              tintColor="#ffffff"
              type="monochrome"
              weight="bold"
            />
          </View>
        ) : null}
      </View>
      <View className="gap-0.5 p-3">
        <Text className="text-base font-t3-medium text-foreground" numberOfLines={1}>
          {props.option.label}
        </Text>
        <Text className="text-xs text-foreground-muted">{props.option.description}</Text>
      </View>
    </Pressable>
  );
}

export function ThemeAppearanceSection() {
  const { appearance, isReady, setThemeId } = useAppearancePreferences();

  const handleSelect = (option: MobileThemeOption) => {
    if (option.id === appearance.themeId) {
      return;
    }
    void Haptics.selectionAsync().catch(() => undefined);
    setThemeId(option.id);
  };

  return (
    <SettingsSection card title="Theme">
      <View className="gap-3 p-3">
        <Text className="px-1 text-sm text-foreground-muted">
          Applies across chat, settings, code, diffs, and the terminal.
        </Text>
        <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-3">
          {MOBILE_THEME_OPTIONS.map((option) => (
            <ThemeCard
              disabled={!isReady}
              key={option.id}
              onSelect={handleSelect}
              option={option}
              selected={appearance.themeId === option.id}
            />
          ))}
        </View>
      </View>
    </SettingsSection>
  );
}
