enum WebhookEvents {
    change_column_value          = "change_column_value",
    change_status_column_value   = "change_status_column_value",
    change_subitem_column_value  = "change_subitem_column_value",
    change_specific_column_value = "change_specific_column_value",
    create_item                  = "create_item",
    create_subitem               = "create_subitem",
    create_update                = "create_update",
    create_subitem_update        = "create_subitem_update",
    change_subitem_name          = "change_subitem_name",
    change_name                  = "change_name",
    incoming_notification        = "incoming_notification",
    item_archived                = "item_archived",
    item_deleted                 = "item_deleted",
    item_moved_to_any_group      = "item_moved_to_any_group",
    item_moved_to_specific_group = "item_moved_to_specific_group",
    subitem_archived             = "subitem_archived",
    subitem_deleted              = "subitem_deleted",
    when_date_arrived            = "when_date_arrived",
}

export default WebhookEvents;