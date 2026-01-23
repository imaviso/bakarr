import { IconX } from "@tabler/icons-solidjs";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { useFilterContext } from "./filter-context";
import type { FilterOperator, FilterState } from "./types";

interface FilterItemProps {
	filter: FilterState;
	index: number;
}

export function FilterItem(props: FilterItemProps) {
	const ctx = useFilterContext();

	const column = createMemo(() =>
		ctx.columns.find((c) => c.id === props.filter.columnId),
	);

	const operatorOptions = createMemo(() => {
		const col = column();
		if (!col) return [];

		switch (col.type) {
			case "text":
				return [
					{ value: "contains", label: "contains" },
					{ value: "does_not_contain", label: "does not contain" },
				];
			case "select":
				return [
					{ value: "is", label: "is" },
					{ value: "is_not", label: "is not" },
				];
			case "multiSelect":
				return [
					{ value: "is_any_of", label: "is any of" },
					{ value: "is_none_of", label: "is none of" },
				];
			case "date":
				return [
					{ value: "is", label: "is" },
					{ value: "is_before", label: "is before" },
					{ value: "is_after", label: "is after" },
				];
			default:
				return [];
		}
	});

	const handleOperatorChange = (operator: FilterOperator | null) => {
		if (operator) {
			ctx.updateFilter(props.index, { operator });
		}
	};

	const handleValueChange = (value: string | string[] | null) => {
		if (value !== null) {
			ctx.updateFilter(props.index, { value });
		}
	};

	return (
		<div class="flex items-center gap-2 bg-muted/50 rounded-md p-2">
			<div class="text-sm font-medium text-muted-foreground min-w-[80px]">
				{column()?.label}
			</div>

			<Select
				value={props.filter.operator}
				onChange={handleOperatorChange}
				options={operatorOptions().map((o) => o.value)}
				placeholder="Select operator"
				itemComponent={(itemProps) => (
					<SelectItem item={itemProps.item}>
						{
							operatorOptions().find((o) => o.value === itemProps.item.rawValue)
								?.label
						}
					</SelectItem>
				)}
			>
				<SelectTrigger class="w-[160px] h-8">
					<SelectValue<string>>
						{(state) =>
							operatorOptions().find((o) => o.value === state.selectedOption())
								?.label || "Select operator"
						}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>

			<Show
				when={column()?.type === "text" || column()?.type === "date"}
				fallback={
					<Select
						value={
							Array.isArray(props.filter.value)
								? props.filter.value[0]
								: props.filter.value
						}
						onChange={(val) => handleValueChange(val || "")}
						options={column()?.options?.map((o) => o.value) || []}
						placeholder="Select value"
						itemComponent={(itemProps) => {
							const option = () =>
								column()?.options?.find(
									(o) => o.value === itemProps.item.rawValue,
								);
							return (
								<SelectItem item={itemProps.item}>
									<Show when={option()?.icon}>
										<span class="mr-2">{option()?.icon}</span>
									</Show>
									{option()?.label}
								</SelectItem>
							);
						}}
					>
						<SelectTrigger class="w-[160px] h-8">
							<SelectValue<string>>
								{(state) => {
									const option = column()?.options?.find(
										(o) => o.value === state.selectedOption(),
									);
									return (
										<Show when={option} fallback="Select value">
											<div class="flex items-center">
												<Show when={option?.icon}>
													<span class="mr-2">{option?.icon}</span>
												</Show>
												{option?.label}
											</div>
										</Show>
									);
								}}
							</SelectValue>
						</SelectTrigger>
						<SelectContent />
					</Select>
				}
			>
				<TextField>
					<TextFieldInput
						type={column()?.type === "date" ? "date" : "text"}
						value={
							Array.isArray(props.filter.value)
								? props.filter.value[0] || ""
								: props.filter.value
						}
						onInput={(e) => handleValueChange(e.currentTarget.value)}
						placeholder={column()?.placeholder || "Enter value"}
						class="h-8 w-[160px]"
					/>
				</TextField>
			</Show>

			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8"
				onClick={() => ctx.removeFilter(props.index)}
			>
				<IconX class="h-4 w-4" />
			</Button>
		</div>
	);
}
