import { Box } from "@mui/material";
import { DropzoneArea } from "mui-file-dropzone";
import { useCallback } from "react";


interface FileDropProps {
    text?: string;
    fileLimit: number;
    onChange: (files: File[]) => void;
    onDropRejected?: () => void;
}


const FileDrop = (props: FileDropProps) => {

    const onChange = useCallback((files: File[]) => {
        console.log('files[0].name', files[0]);
        props.onChange(files);
    },[props]);

    console.log('FileDrop Refreshing...', props);
    
    return (
        <>
            {props.text && (<p>{props.text}</p>)}
            <Box component="section">
                <DropzoneArea dropzoneClass="drop_zone" filesLimit={props.fileLimit} showPreviews={false} showPreviewsInDropzone={true} useChipsForPreview={true} 
                        showAlerts={false} dropzoneText={''} onDropRejected={props.onDropRejected} onChange={onChange} />
            </Box>
        </>
    );
};

export default FileDrop;
