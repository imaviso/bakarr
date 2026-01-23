import { IconX } from "@tabler/icons-solidjs";
import { createMemo, Show } from "solid-js";
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

		let options: { value: FilterOperator; label: string }[] = [];

		switch (col.type) {
			case "text":
				options = [
					{ value: "contains", label: "contains" },
					{ value: "does_not_contain", label: "does not contain" },
				];
				break;
			case "select":
				options = [
					{ value: "is", label: "is" },
					{ value: "is_not", label: "is not" },
				];
				break;
			case "multiSelect":
				options = [
					{ value: "is_any_of", label: "is any of" },
					{ value: "is_none_of", label: "is none of" },
				];
				break;
			case "date":
				options = [
					{ value: "is", label: "is" },
					{ value: "is_before", label: "is before" },
					{ value: "is_after", label: "is after" },
				];
				break;
			default:
				options = [];
		}

		if (col.operators && col.operators.length > 0) {
			return options.filter((o) => col.operators?.includes(o.value));
		}

		return options;
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
		<div class="flex items-center gap-1.5 bg-muted/50 rounded-md p-1 pr-2">
			<div class="text-sm font-medium text-muted-foreground px-2">
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
				<SelectTrigger class="w-[140px] h-8 px-2 bg-background focus:ring-0 focus:ring-offset-0 border-muted-foreground/20">
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
						<SelectTrigger class="w-[160px] h-8 px-2 bg-background focus:ring-0 focus:ring-offset-0 border-muted-foreground/20">
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
						class="h-8 w-[160px] px-2 bg-background focus-visible:ring-0 focus-visible:ring-offset-0 border-muted-foreground/20"
					/>
				</TextField>
			</Show>

			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
				onClick={() => ctx.removeFilter(props.index)}
			>
				<IconX class="h-3 w-3" />
			</Button>
		</div>
	);
}
